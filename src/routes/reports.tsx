import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState, useMemo } from "react";
import { getLocalUser } from "@/lib/api-key";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import {
  TrendingUp, TrendingDown, Download, Filter, Calendar,
  Sparkles, AlertTriangle, Lightbulb, Users, ChevronRight,
  FileText, BarChart2, PieChart, ArrowUpRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/reports")({
  component: () => <AppShell><ReportsPage /></AppShell>,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function monthLabel(m: number, y: number) {
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

const PIE_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#94a3b8", "#fb923c"];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function ReportsPage() {
  const [apiKey, setApiKey] = useState("");
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  useEffect(() => { setApiKey(getLocalUser()?.apiKey ?? ""); }, []);

  const callTool = useServerFn(mcpCall);

  // Current month report
  const report = useQuery({
    enabled: !!apiKey,
    queryKey: ["monthly_report", month, year, apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "monthly_report", args: { month, year } } });
      if (!r.ok) throw new Error(r.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.data as any;
    },
  });

  // Previous month for comparison
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevReport = useQuery({
    enabled: !!apiKey,
    queryKey: ["monthly_report", prevMonth, prevYear, apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "monthly_report", args: { month: prevMonth, year: prevYear } } });
      if (!r.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.data as any;
    },
  });

  // Groups for top spenders
  const groups = useQuery({
    enabled: !!apiKey,
    queryKey: ["groups", apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "list_my_groups", args: {} } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? (Array.isArray(r.data) ? r.data : (r.data as any)?.groups ?? []) as any[] : [];
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = report.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev: any = prevReport.data;

  const totalSpent = data?.total_spent ?? 0;
  const prevTotal = prev?.total_spent ?? 0;
  const pctChange = prevTotal > 0 ? ((totalSpent - prevTotal) / prevTotal) * 100 : 0;
  const txCount = data?.transaction_count ?? 0;
  const prevTxCount = prev?.transaction_count ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topCategories: any[] = data?.top_categories ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dailyTotals: any[] = data?.daily_totals ?? [];

  // Build chart data
  const chartData = useMemo(() => {
    return dailyTotals.map((d) => ({
      date: d.date?.slice(5) ?? "", // MM-DD
      amount: d.total ?? 0,
    }));
  }, [dailyTotals]);

  // AI insights derived from data
  const insights = useMemo(() => {
    if (!data) return [];
    const ins = [];
    const topCat = topCategories[0];
    if (topCat && prevTotal > 0) {
      ins.push({
        icon: TrendingUp,
        color: "text-success",
        bg: "bg-success/10",
        text: `${topCat.category} is your top spending category at ${topCat.percentage?.toFixed(1)}% of total.`,
      });
    }
    const ww = data.weekday_vs_weekend;
    if (ww && ww.weekend_percentage > 30) {
      ins.push({
        icon: AlertTriangle,
        color: "text-warning",
        bg: "bg-warning/10",
        text: `You spent ${ww.weekend_percentage?.toFixed(1)}% more on weekends than weekdays.`,
      });
    }
    if (topCategories[1]) {
      ins.push({
        icon: Lightbulb,
        color: "text-info",
        bg: "bg-info/10",
        text: `${topCategories[1].category} is your 2nd highest spending category this month.`,
      });
    }
    if (groups.data && groups.data.length > 0) {
      ins.push({
        icon: Users,
        color: "text-primary",
        bg: "bg-primary/10",
        text: `You are part of ${groups.data.length} group${groups.data.length > 1 ? "s" : ""}. Check group balances for shared expenses.`,
      });
    }
    return ins.slice(0, 4);
  }, [data, topCategories, prevTotal, groups.data]);

  const loading = report.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Deep insights into your spending and group finances.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range picker */}
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-input border border-border text-sm">
            <Calendar className="size-3.5 text-muted-foreground" />
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-transparent outline-none text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2024, m - 1, 1).toLocaleString("en", { month: "short" })}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-transparent outline-none w-14 text-sm"
            />
          </div>
          <button className="h-9 px-3 rounded-lg bg-input border border-border text-sm flex items-center gap-1.5 hover:bg-accent">
            <Filter className="size-3.5" /> Filters
          </button>
          <button
            onClick={() => {
              const text = `PromptLedger Report — ${monthLabel(month, year)}\n\nTotal Spent: ${fmtINR(totalSpent)}\nTransactions: ${txCount}\n\nTop Categories:\n${topCategories.map((c) => `  ${c.category}: ${fmtINR(c.total)} (${c.percentage?.toFixed(1)}%)`).join("\n")}`;
              const blob = new Blob([text], { type: "text/plain" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `report-${year}-${String(month).padStart(2, "0")}.txt`;
              a.click();
            }}
            className="h-9 px-3 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm flex items-center gap-1.5 hover:opacity-90"
          >
            <Download className="size-3.5" /> Download Report
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Spent"
          value={loading ? "…" : fmtINR(totalSpent)}
          change={pctChange}
          prevLabel={`vs ${monthLabel(prevMonth, prevYear)}`}
          color="bg-primary/10 border-primary/20"
          icon={<BarChart2 className="size-4 text-primary" />}
        />
        <KpiCard
          label="You Spent"
          value={loading ? "…" : fmtINR(totalSpent)}
          change={pctChange}
          prevLabel={`vs ${monthLabel(prevMonth, prevYear)}`}
          color="bg-info/10 border-info/20"
          icon={<ArrowUpRight className="size-4 text-info" />}
        />
        <KpiCard
          label="You Owed"
          value="₹0"
          change={0}
          prevLabel="No pending"
          color="bg-warning/10 border-warning/20"
          icon={<TrendingDown className="size-4 text-warning" />}
        />
        <KpiCard
          label="You Are Owed"
          value="₹0"
          change={0}
          prevLabel="All settled"
          color="bg-success/10 border-success/20"
          icon={<TrendingUp className="size-4 text-success" />}
        />
        <KpiCard
          label="Transactions"
          value={loading ? "…" : String(txCount)}
          change={prevTxCount > 0 ? ((txCount - prevTxCount) / prevTxCount) * 100 : 0}
          prevLabel={`vs ${monthLabel(prevMonth, prevYear)}`}
          color="bg-secondary border-border"
          icon={<FileText className="size-4 text-muted-foreground" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending Overview — donut */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Spending Overview</div>
            <span className="text-xs text-muted-foreground">{monthLabel(month, year)}</span>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : topCategories.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <div className="flex items-center gap-6">
              <DonutChart categories={topCategories} total={totalSpent} />
              <div className="flex-1 min-w-0 space-y-2">
                {topCategories.slice(0, 6).map((c, i) => (
                  <div key={c.category} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 truncate text-xs">{c.category}</span>
                    <span className="font-medium text-xs">{fmtINR(c.total)}</span>
                    <span className="text-[11px] text-muted-foreground w-12 text-right">({c.percentage?.toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Spending Trend — area chart */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Spending Trend</div>
            <span className="text-xs text-muted-foreground">Daily</span>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtINR(v), "Spent"]}
                />
                <Area type="monotone" dataKey="amount" stroke="#a78bfa" strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: "#a78bfa" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Categories */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Top Categories</div>
            <button className="text-xs text-primary hover:underline">View all</button>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : topCategories.length === 0 ? (
            <div className="text-sm text-muted-foreground">No data this month.</div>
          ) : (
            <div className="space-y-3">
              {topCategories.slice(0, 6).map((c, i) => (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg grid place-items-center text-[11px] font-bold" style={{ background: PIE_COLORS[i % PIE_COLORS.length] + "22", color: PIE_COLORS[i % PIE_COLORS.length] }}>
                        {c.category.slice(0, 1)}
                      </div>
                      <span className="truncate max-w-[100px]">{c.category}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-xs">{fmtINR(c.total)}</div>
                      <div className="text-[10px] text-muted-foreground">{c.percentage?.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.percentage ?? 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Spenders (groups) */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Your Groups</div>
            <button className="text-xs text-primary hover:underline">View all</button>
          </div>
          {groups.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (groups.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">No groups yet.</div>
          ) : (
            <div className="space-y-3">
              {groups.data?.slice(0, 6).map((g, i) => (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <div key={(g as any).id ?? i} className="flex items-center gap-3">
                  <div className="size-7 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold shrink-0">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {String((g as any).name ?? "G").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div className="text-sm font-medium truncate">{(g as any).name}</div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div className="text-[11px] text-muted-foreground">{(g as any).kind ?? "group"}</div>
                  </div>
                  <div className="h-1.5 flex-1 max-w-[60px] rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(20, 100 - i * 15)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Reports */}
        <div className="glass rounded-2xl p-5">
          <div className="font-semibold mb-4">Recent Reports</div>
          <div className="space-y-2">
            {[
              { label: `Monthly Summary — ${monthLabel(month, year)}`, icon: FileText, color: "text-primary bg-primary/10", date: "Generated just now" },
              { label: "Category Breakdown", icon: PieChart, color: "text-destructive bg-destructive/10", date: `Generated for ${monthLabel(month, year)}` },
              { label: "Group Settlement Summary", icon: Users, color: "text-success bg-success/10", date: `Generated for ${monthLabel(month, year)}` },
              { label: "Spending Trend Report", icon: TrendingUp, color: "text-info bg-info/10", date: `Generated for ${monthLabel(prevMonth, prevYear)}` },
              { label: "Budget vs Actual", icon: BarChart2, color: "text-warning bg-warning/10", date: `Generated for ${monthLabel(prevMonth, prevYear)}` },
            ].map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/40 cursor-pointer group">
                  <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${r.color}`}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.label}</div>
                    <div className="text-[11px] text-muted-foreground">{r.date}</div>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="size-4 text-primary" />
          <div className="font-semibold">AI Insights</div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Smart insights generated from your spending.</p>
        {loading ? (
          <div className="text-sm text-muted-foreground">Analyzing your data…</div>
        ) : insights.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data available for insights this month.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.map((ins, i) => {
              const Icon = ins.icon;
              return (
                <div key={i} className={`rounded-xl p-3 border border-border ${ins.bg}`}>
                  <Icon className={`size-4 mb-2 ${ins.color}`} />
                  <p className="text-xs text-foreground/80 leading-relaxed">{ins.text}</p>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Reports are real-time and update as new transactions are added.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, change, prevLabel, color, icon,
}: {
  label: string;
  value: string;
  change: number;
  prevLabel: string;
  color: string;
  icon: React.ReactNode;
}) {
  const up = change >= 0;
  return (
    <div className={`rounded-2xl p-4 border ${color}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="size-7 rounded-lg bg-background/30 grid place-items-center">{icon}</div>
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
      <div className={`flex items-center gap-1 mt-1 text-[11px] ${up ? "text-success" : "text-destructive"}`}>
        {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
        <span>{Math.abs(change).toFixed(1)}% {prevLabel}</span>
      </div>
    </div>
  );
}

function DonutChart({
  categories,
  total,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categories: any[];
  total: number;
}) {
  const entries = categories.slice(0, 6);
  const sum = entries.reduce((s, c) => s + (c.total ?? 0), 0) || 1;
  let acc = 0;
  const stops = entries.map((c, i) => {
    const start = (acc / sum) * 100;
    acc += c.total ?? 0;
    const end = (acc / sum) * 100;
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}% ${end}%`;
  }).join(", ");

  return (
    <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      />
      <div className="absolute inset-4 rounded-full bg-card grid place-items-center">
        <div className="text-center">
          <div className="text-base font-bold">{fmtINR(total)}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
      </div>
    </div>
  );
}
