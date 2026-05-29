/**
 * Budget tools — list, create/update, delete.
 * Backed by the budgets table + fn_list_budgets / fn_upsert_budget / fn_delete_budget RPCs.
 *
 * Single Responsibility: budget CRUD with live spend calculation.
 */

import { getClientForApiKey } from "../supabase.server";
import { withPendingHint, toolError } from "../pending-hint.server";

export async function listBudgets(apiKey: string): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_list_budgets");
    if (error) return { result: toolError(`list_budgets: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_budgets: ${String(e)}`) };
  }
}

export async function upsertBudget(
  apiKey: string,
  args: {
    id?: string | null;
    name: string;
    budget_type?: string;
    category?: string | null;
    group_id?: string | null;
    amount: number;
    period?: string;
    period_start?: string | null;
    period_end?: string | null;
    emoji?: string;
    color?: string;
  },
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_upsert_budget", {
      p_id:           args.id ?? null,
      p_name:         args.name,
      p_budget_type:  args.budget_type ?? "personal",
      p_category:     args.category ?? null,
      p_group_id:     args.group_id ?? null,
      p_amount:       args.amount,
      p_period:       args.period ?? "monthly",
      p_period_start: args.period_start ?? null,
      p_period_end:   args.period_end ?? null,
      p_emoji:        args.emoji ?? "💰",
      p_color:        args.color ?? "#a78bfa",
    });
    if (error) return { result: toolError(`upsert_budget: ${error.message}`) };
    return withPendingHint({
      status: "success",
      id: data as string,
      message: args.id ? "Budget updated" : "Budget created",
    }, ac);
  } catch (e) {
    return { result: toolError(`upsert_budget: ${String(e)}`) };
  }
}

export async function deleteBudget(
  apiKey: string,
  budgetId: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_delete_budget", { p_id: budgetId });
    if (error) return { result: toolError(`delete_budget: ${error.message}`) };
    return withPendingHint(
      typeof data === "object" && data !== null ? data : { status: "success" },
      ac,
    );
  } catch (e) {
    return { result: toolError(`delete_budget: ${String(e)}`) };
  }
}
