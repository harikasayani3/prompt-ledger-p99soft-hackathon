import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { getLocalUser } from "@/lib/api-key";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { Check, X, Clock, SplitSquareHorizontal, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/approvals")({ component: () => <AppShell><Approvals /></AppShell> });

function fmtINR(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN"); }

function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function parseSplitNote(note: string): { baseNote: string; splits: { name: string; amount: string }[] } {
  const idx = note?.indexOf("| Split:") ?? -1;
  if (idx === -1) return { baseNote: note ?? "", splits: [] };
  const baseNote = note.slice(0, idx).trim();
  const splitStr = note.slice(idx + 8).trim(); // after "| Split: "
  const splits = splitStr.split(",").map((s) => {
    const [name, amount] = s.split(":").map((x) => x.trim());
    return { name: name ?? "", amount: amount ?? "" };
  });
  return { baseNote, splits };
}

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callTool({ data: { apiKey, name: "list_my_pending_approvals", args: {} } }) as any;
      if (!r.ok) throw new Error(r.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = r.data as any;
      // list_my_pending_approvals now returns a plain array of transaction rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = Array.isArray(data) ? data : [];
      return list;
    },
  });

  const act = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callTool({ data: { apiKey, name: approve ? "approve_group_expense" : "reject_group_expense", args: { transaction_id: id } } }) as any;
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved ✓" : "Rejected");
      qc.invalidateQueries({ queryKey: ["pending"] });
      qc.invalidateQueries({ queryKey: ["approvals-count"] });
      qc.invalidateQueries({ queryKey: ["group-tx"] });
      qc.invalidateQueries({ queryKey: ["group-summary"] });
      qc.invalidateQueries({ queryKey: ["group-balances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const isEmpty = !q.isLoading && (q.data?.length ?? 0) === 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">Group expenses waiting for your sign-off.</p>
        </div>
        {(q.data?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/15 border border-warning/30">
            <Clock className="size-3.5 text-warning" />
            <span className="text-xs font-semibold text-warning">{q.data?.length} pending</span>
          </div>
        )}
      </div>

      {/* How approval works — info card */}
      {(q.data?.length ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-primary/8 border border-primary/20 px-4 py-3">
          <Users className="size-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">All members must approve</span> before an expense is finalized
            and balances are updated. You can reject to decline the expense entirely.
          </div>
        </div>
      )}

      <div className="glass rounded-2xl divide-y divide-border overflow-hidden">
        {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}

        {isEmpty && (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="font-medium mb-1">All caught up!</div>
            <div className="text-sm text-muted-foreground">No expenses waiting for your approval.</div>
          </div>
        )}

        {q.data?.map((row, i) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r: any = row;
          const id = r.transaction_id ?? r.id;
          const noteRaw: string = r.note ?? "";
          const { baseNote, splits } = parseSplitNote(noteRaw);
          const isCustomSplit = r.subcategory === "custom_split" || splits.length > 0;
          const memberCount = r.member_count ?? splits.length ?? 0;
          const equalShare = memberCount > 0 ? Number(r.amount ?? 0) / memberCount : 0;
          const isPending = act.isPending && act.variables?.id === id;

          return (
            <div key={i} className="p-5 space-y-3">
              {/* Top row */}
              <div className="flex items-start gap-4">
                <div className="size-11 rounded-xl bg-primary/15 grid place-items-center text-primary font-bold text-lg shrink-0">
                  {String(r.category ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold">{baseNote || r.category || "Expense"}</div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-semibold border border-warning/25">
                      Pending Approval
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.group_name ?? r.group_id
                      ? <span className="font-medium">{r.group_name ?? "Group"}</span>
                      : null}
                    {r.group_name ? " · " : ""}
                    Submitted by {r.submitted_by_name ?? r.payer_name ?? r.payer_user_id ?? "—"}
                    {" · "}
                    {r.expense_date ?? r.date ?? ""}
                    {r.created_at ? ` · ${timeAgo(r.created_at)}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-lg">{fmtINR(Number(r.amount ?? 0))}</div>
                  <div className="text-xs text-muted-foreground">{r.category}</div>
                </div>
              </div>

              {/* Split breakdown */}
              <div className={`rounded-xl border px-4 py-3 ${isCustomSplit ? "bg-secondary/40 border-border" : "bg-secondary/20 border-border/50"}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <SplitSquareHorizontal className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold">
                    {isCustomSplit ? "Custom Split" : "Equal Split"}
                  </span>
                </div>
                {isCustomSplit && splits.length > 0 ? (
                  <div className="space-y-1">
                    {splits.map((s, si) => (
                      <div key={si} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{s.name}</span>
                        <span className="font-medium font-mono">{s.amount.startsWith("₹") ? s.amount : `₹${s.amount}`}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Split equally among all members
                    {equalShare > 0 && (
                      <span className="ml-1 font-medium text-foreground">({fmtINR(equalShare)} each)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => act.mutate({ id, approve: false })}
                  disabled={isPending}
                  className="flex-1 h-9 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <X className="size-4" />
                  Reject
                </button>
                <button
                  onClick={() => act.mutate({ id, approve: true })}
                  disabled={isPending}
                  className="flex-1 h-9 rounded-xl bg-success/15 text-success hover:bg-success/25 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Check className="size-4" />
                  Approve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
