import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { getLocalUser } from "@/lib/api-key";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/approvals")({ component: () => <AppShell><Approvals /></AppShell> });

function fmtINR(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN"); }

function Approvals() {
  const [apiKey, setApiKey] = useState("");
  useEffect(() => { setApiKey(getLocalUser()?.apiKey ?? ""); }, []);
  const callTool = useServerFn(mcpCall);
  const qc = useQueryClient();

  const q = useQuery({
    enabled: !!apiKey,
    queryKey: ["pending", apiKey],
    refetchInterval: 15_000,
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "list_my_pending_approvals", args: {} } });
      const data = r.ok ? r.data : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(data) ? data : (data as any)?.pending ?? [];
      return list;
    },
  });

  const act = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const r = await callTool({ data: { apiKey, name: approve ? "approve_group_expense" : "reject_group_expense", args: { transaction_id: id } } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (_d, v) => { toast.success(v.approve ? "Approved" : "Rejected"); qc.invalidateQueries({ queryKey: ["pending"] }); qc.invalidateQueries({ queryKey: ["approvals-count"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pending Approvals</h1>
        <p className="text-sm text-muted-foreground">Group expenses waiting for your sign-off.</p>
      </div>
      <div className="glass rounded-2xl divide-y divide-border">
        {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!q.isLoading && (q.data?.length ?? 0) === 0 && <div className="p-6 text-sm text-muted-foreground">All caught up.</div>}
        {q.data?.map((row, i) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r: any = row;
          const id = r.transaction_id ?? r.id;
          return (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="size-10 rounded-lg bg-primary/15 grid place-items-center text-primary font-semibold">
                {String(r.category ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{r.note || r.category || "Expense"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.group_name ?? r.group_id} · paid by {r.payer_name ?? r.payer_user_id ?? "—"} · {r.expense_date ?? r.date ?? ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{fmtINR(Number(r.amount ?? 0))}</div>
                <div className="text-xs text-muted-foreground">{r.category}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => act.mutate({ id, approve: true })} disabled={act.isPending}
                  className="size-9 rounded-lg bg-success/20 text-success hover:bg-success/30 grid place-items-center">
                  <Check className="size-4" />
                </button>
                <button onClick={() => act.mutate({ id, approve: false })} disabled={act.isPending}
                  className="size-9 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 grid place-items-center">
                  <X className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
