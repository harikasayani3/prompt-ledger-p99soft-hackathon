/**
 * Group balance accumulation and debt simplification.
 * Mirrors settlements.py exactly.
 *
 * Single Responsibility: pure financial math — no I/O, no Supabase.
 */

export interface TransactionRow {
  payer_id: string;
  amount: number;
  transaction_splits?: Array<{ member_id: string; share_amount: number }>;
}

export interface Transfer {
  from_user: string;
  to_user: string;
  amount: number;
}

/**
 * Net balance per member from approved transactions.
 * Positive = others owe them. Negative = they owe others.
 */
export function accumulateGroupBalances(transactions: TransactionRow[]): Record<string, number> {
  const net: Record<string, number> = {};

  for (const t of transactions) {
    const payer = t.payer_id;
    const amount = Number(t.amount) || 0;
    const splits = t.transaction_splits ?? [];

    let payerShare = 0;
    for (const s of splits) {
      const mid = s.member_id;
      const share = Number(s.share_amount) || 0;
      net[mid] = (net[mid] ?? 0) - share;
      if (mid === payer) payerShare = share;
    }
    net[payer] = (net[payer] ?? 0) + amount - payerShare;
  }

  return net;
}

/**
 * Greedy minimum-cash-flow algorithm.
 * Returns the minimum set of transfers to fully settle the group.
 */
export function simplifyDebts(net: Record<string, number>, eps = 1e-4): Transfer[] {
  const debtors: Array<[string, number]> = [];
  const creditors: Array<[string, number]> = [];

  for (const [uid, balance] of Object.entries(net)) {
    if (balance < -eps) debtors.push([uid, -balance]);
    else if (balance > eps) creditors.push([uid, balance]);
  }

  debtors.sort((a, b) => b[1] - a[1]);
  creditors.sort((a, b) => b[1] - a[1]);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const [du, da] = debtors[i];
    const [cu, ca] = creditors[j];
    const pay = Math.round(Math.min(da, ca) * 100) / 100;

    if (pay > eps) {
      transfers.push({ from_user: du, to_user: cu, amount: pay });
    }

    debtors[i] = [du, da - pay];
    creditors[j] = [cu, ca - pay];

    if (debtors[i][1] <= eps) i++;
    if (creditors[j][1] <= eps) j++;
  }

  return transfers;
}
