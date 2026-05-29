/**
 * Balance and settlement tools.
 * Mirrors the balance & settlement section of server.py.
 *
 * Single Responsibility: group financial balances and settlement recording.
 */

import { getClientForApiKey } from "../supabase.server";
import { withPendingHint, toolError } from "../pending-hint.server";
import { accumulateGroupBalances, simplifyDebts, type TransactionRow } from "../settlements.server";

export async function groupBalances(
  apiKey: string,
  groupId: string,
  includeSettlements = false, // default false to avoid ambiguous column RPC bug
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    let net: Record<string, number>;

    if (includeSettlements) {
      // Try the RPC — may fail with ambiguous column on some DB versions
      const { data, error } = await ac.client.rpc("fn_group_balances_with_settlements", {
        p_group_id: groupId,
      });
      if (error) {
        // Fall back to direct calculation without settlements
        return groupBalances(apiKey, groupId, false);
      }
      net = {};
      for (const r of (data ?? []) as Array<{ user_id: string; net_balance: number }>) {
        net[r.user_id] = Number(r.net_balance);
      }
    } else {
      const { data, error } = await ac.client
        .from("transactions")
        .select("id,payer_id,amount,transaction_splits(member_id,share_amount)")
        .eq("group_id", groupId)
        .eq("status", "approved");
      if (error) return { result: toolError(`group_balances: ${error.message}`) };
      net = accumulateGroupBalances((data ?? []) as TransactionRow[]);
    }

    return withPendingHint({ group_id: groupId, net_by_user_id: net }, ac);
  } catch (e) {
    return { result: toolError(`group_balances: ${String(e)}`) };
  }
}

export async function simplifyGroupDebts(
  apiKey: string,
  groupId: string,
  includeSettlements = true,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    let net: Record<string, number>;

    if (includeSettlements) {
      const { data, error } = await ac.client.rpc("fn_group_balances_with_settlements", {
        p_group_id: groupId,
      });
      if (error) return { result: toolError(`simplify_group_debts: ${error.message}`) };
      net = {};
      for (const r of (data ?? []) as Array<{ user_id: string; net_balance: number }>) {
        net[r.user_id] = Number(r.net_balance);
      }
    } else {
      const { data, error } = await ac.client
        .from("transactions")
        .select("id,payer_id,amount,transaction_splits(member_id,share_amount)")
        .eq("group_id", groupId)
        .eq("status", "approved");
      if (error) return { result: toolError(`simplify_group_debts: ${error.message}`) };
      net = accumulateGroupBalances((data ?? []) as TransactionRow[]);
    }

    return withPendingHint({
      group_id: groupId,
      net_by_user_id: net,
      suggested_transfers: simplifyDebts(net),
    }, ac);
  } catch (e) {
    return { result: toolError(`simplify_group_debts: ${String(e)}`) };
  }
}

export async function recordSettlement(
  apiKey: string,
  groupId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  paymentDate?: string | null,
  note = "",
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const args: Record<string, unknown> = {
      p_group_id: groupId,
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_amount: amount,
      p_note: note || "",
    };
    if (paymentDate) args.p_payment_date = paymentDate;

    const { data, error } = await ac.client.rpc("fn_record_settlement", args);
    if (error) return { result: toolError(`record_settlement: ${error.message}`) };

    return withPendingHint({
      status: "success",
      settlement_id: data as string,
      message: `Recorded: ${fromUserId} → ${toUserId} ₹${amount}`,
    }, ac);
  } catch (e) {
    return { result: toolError(`record_settlement: ${String(e)}`) };
  }
}

export async function listGroupSettlements(
  apiKey: string,
  groupId: string,
  startDate?: string | null,
  endDate?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    let q = ac.client
      .from("settlement_payments")
      .select("id,from_user_id,to_user_id,amount,payment_date,note,recorded_by,created_at")
      .eq("group_id", groupId);

    if (startDate) q = q.gte("payment_date", startDate);
    if (endDate) q = q.lte("payment_date", endDate);

    const { data, error } = await q.order("payment_date", { ascending: false });
    if (error) return { result: toolError(`list_group_settlements: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_group_settlements: ${String(e)}`) };
  }
}
