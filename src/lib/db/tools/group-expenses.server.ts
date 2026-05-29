/**
 * Group expense tools — add, list, approve, reject, delete, summary, pending.
 * Mirrors the group expense section of server.py.
 *
 * Single Responsibility: group transaction lifecycle and approval workflow.
 */

import { getClientForApiKey } from "../supabase.server";
import { jwtSubject } from "../jwt.server";
import { withPendingHint, toolError } from "../pending-hint.server";

export async function addGroupExpense(
  apiKey: string,
  groupId: string,
  expenseDate: string,
  amount: number,
  category: string,
  subcategory = "",
  note = "",
  payerUserId?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_add_group_expense", {
      p_group_id: groupId,
      p_expense_date: expenseDate,
      p_amount: amount,
      p_category: category,
      p_subcategory: subcategory || "",
      p_note: note || "",
      p_payer_id: payerUserId ?? null,
    });
    if (error) return { result: toolError(`fn_add_group_expense: ${error.message}`) };
    return withPendingHint({ status: "success", transaction_id: data as string }, ac);
  } catch (e) {
    return { result: toolError(`fn_add_group_expense: ${String(e)}`) };
  }
}

async function voteOnTransaction(
  apiKey: string,
  transactionId: string,
  vote: "approve" | "reject",
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_vote_on_transaction", {
      p_transaction_id: transactionId,
      p_vote: vote,
    });
    if (error) return { result: toolError(`vote: ${error.message}`) };
    return withPendingHint({ status: "success", vote_result: data }, ac);
  } catch (e) {
    return { result: toolError(`vote: ${String(e)}`) };
  }
}

export async function approveGroupExpense(
  apiKey: string,
  transactionId: string,
): Promise<Record<string, unknown>> {
  return voteOnTransaction(apiKey, transactionId, "approve");
}

export async function rejectGroupExpense(
  apiKey: string,
  transactionId: string,
): Promise<Record<string, unknown>> {
  return voteOnTransaction(apiKey, transactionId, "reject");
}

export async function listPendingGroupExpenses(
  apiKey: string,
  groupId: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client
      .from("transactions")
      .select("id,submitted_by,payer_id,expense_date,amount,category,subcategory,note,status")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .order("expense_date", { ascending: false });
    if (error) return { result: toolError(`list_pending_group_expenses: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_pending_group_expenses: ${String(e)}`) };
  }
}

export async function listMyPendingApprovals(apiKey: string): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);
    const { data, error } = await ac.client.rpc("fn_get_pending_count", { p_user_id: uid });
    if (error) return { result: toolError(`list_my_pending_approvals: ${error.message}`) };

    const rows = Array.isArray(data) ? data : [];
    const row = rows[0] as { count?: number; sample?: unknown[] } | undefined;
    return withPendingHint(
      { count: row?.count ?? 0, items: row?.sample ?? [] },
      ac,
    );
  } catch (e) {
    return { result: toolError(`list_my_pending_approvals: ${String(e)}`) };
  }
}

export async function listGroupTransactions(
  apiKey: string,
  groupId: string,
  startDate?: string | null,
  endDate?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    let q = ac.client
      .from("transactions")
      .select("id,submitted_by,payer_id,expense_date,amount,category,subcategory,note,status,created_at")
      .eq("group_id", groupId);

    if (startDate) q = q.gte("expense_date", startDate);
    if (endDate) q = q.lte("expense_date", endDate);

    const { data, error } = await q.order("expense_date", { ascending: false });
    if (error) return { result: toolError(`list_group_transactions: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_group_transactions: ${String(e)}`) };
  }
}

export async function deleteGroupExpense(
  apiKey: string,
  transactionId: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_delete_group_expense", {
      p_transaction_id: transactionId,
    });
    if (error) return { result: toolError(`delete_group_expense: ${error.message}`) };
    return withPendingHint(
      typeof data === "object" && data !== null ? data : { status: "success" },
      ac,
    );
  } catch (e) {
    return { result: toolError(`delete_group_expense: ${String(e)}`) };
  }
}

export async function groupSummary(
  apiKey: string,
  groupId: string,
  startDate?: string | null,
  endDate?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    let q = ac.client
      .from("transactions")
      .select("category,amount,payer_id,expense_date")
      .eq("group_id", groupId)
      .eq("status", "approved");

    if (startDate) q = q.gte("expense_date", startDate);
    if (endDate) q = q.lte("expense_date", endDate);

    const { data, error } = await q;
    if (error) return { result: toolError(`group_summary: ${error.message}`) };

    const rows = data ?? [];
    let total = 0;
    const buckets: Record<string, { total_amount: number; count: number }> = {};

    for (const r of rows) {
      const cat = (r.category as string) || "Other";
      const amt = Number(r.amount) || 0;
      total += amt;
      if (!buckets[cat]) buckets[cat] = { total_amount: 0, count: 0 };
      buckets[cat].total_amount += amt;
      buckets[cat].count += 1;
    }

    const breakdown = Object.entries(buckets)
      .sort((a, b) => b[1].total_amount - a[1].total_amount)
      .map(([cat, v]) => ({
        category: cat,
        total_amount: Math.round(v.total_amount * 100) / 100,
        count: v.count,
        percentage: total > 0 ? Math.round((v.total_amount / total) * 1000) / 10 : 0,
      }));

    return withPendingHint({
      group_id: groupId,
      total_spent: Math.round(total * 100) / 100,
      transaction_count: rows.length,
      breakdown_by_category: breakdown,
    }, ac);
  } catch (e) {
    return { result: toolError(`group_summary: ${String(e)}`) };
  }
}
