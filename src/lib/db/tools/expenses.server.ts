/**
 * Personal expense tools (no group_id).
 * Mirrors the personal expense section of server.py.
 *
 * Single Responsibility: CRUD + reporting for personal transactions.
 */

import { getClientForApiKey } from "../supabase.server";
import { jwtSubject } from "../jwt.server";
import { withPendingHint, toolError } from "../pending-hint.server";

export async function addExpense(
  apiKey: string,
  date: string,
  amount: number,
  category: string,
  subcategory = "",
  note = "",
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data, error } = await ac.client.from("transactions").insert({
      submitted_by: uid,
      payer_id: uid,
      expense_date: date,
      amount,
      category,
      subcategory: subcategory || "",
      note: note || "",
      status: "approved",
      group_id: null,
    }).select("id").single();

    if (error || !data) {
      return withPendingHint(toolError(`Insert failed: ${error?.message ?? "no data"}`), ac);
    }

    return withPendingHint({
      status: "success",
      id: data.id as string,
      message: "Expense added successfully",
    }, ac);
  } catch (e) {
    return { result: toolError(`Database error: ${String(e)}`) };
  }
}

export async function listExpenses(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);

    const { data, error } = await ac.client
      .from("transactions")
      .select("id,expense_date,amount,category,subcategory,note,created_at,status")
      .is("group_id", null)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: false });

    if (error) return { result: toolError(`Error listing expenses: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`Error listing expenses: ${String(e)}`) };
  }
}

export async function summarize(
  apiKey: string,
  startDate: string,
  endDate: string,
  category?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);

    let q = ac.client
      .from("transactions")
      .select("category,amount")
      .is("group_id", null)
      .gte("expense_date", startDate)
      .lte("expense_date", endDate);

    if (category) q = q.eq("category", category);

    const { data, error } = await q;
    if (error) return { result: toolError(`Error summarizing: ${error.message}`) };

    const buckets: Record<string, { total_amount: number; count: number }> = {};
    for (const row of data ?? []) {
      const cat = (row.category as string) || "Other";
      const amt = Number(row.amount) || 0;
      if (!buckets[cat]) buckets[cat] = { total_amount: 0, count: 0 };
      buckets[cat].total_amount += amt;
      buckets[cat].count += 1;
    }

    const out = Object.entries(buckets)
      .sort((a, b) => b[1].total_amount - a[1].total_amount)
      .map(([cat, v]) => ({
        category: cat,
        total_amount: Math.round(v.total_amount * 100) / 100,
        count: v.count,
      }));

    return withPendingHint(out, ac);
  } catch (e) {
    return { result: toolError(`Error summarizing: ${String(e)}`) };
  }
}

export async function deleteExpense(
  apiKey: string,
  expenseId: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data: check } = await ac.client
      .from("transactions")
      .select("id")
      .eq("id", expenseId)
      .eq("submitted_by", uid)
      .is("group_id", null);

    if (!check || check.length === 0) {
      return toolError("Expense not found or you don't have permission to delete it.");
    }

    const { error } = await ac.client.from("transactions").delete().eq("id", expenseId);
    if (error) return { result: toolError(`Delete failed: ${error.message}`) };

    return withPendingHint({ status: "success", message: `Expense ${expenseId} deleted.` }, ac);
  } catch (e) {
    return { result: toolError(`Delete failed: ${String(e)}`) };
  }
}

export async function editExpense(
  apiKey: string,
  expenseId: string,
  date?: string | null,
  amount?: number | null,
  category?: string | null,
  subcategory?: string | null,
  note?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data: check } = await ac.client
      .from("transactions")
      .select("id")
      .eq("id", expenseId)
      .eq("submitted_by", uid)
      .is("group_id", null);

    if (!check || check.length === 0) {
      return toolError("Expense not found or you don't have permission to edit it.");
    }

    const updates: Record<string, unknown> = {};
    if (date != null) updates.expense_date = date;
    if (amount != null) updates.amount = amount;
    if (category != null) updates.category = category;
    if (subcategory != null) updates.subcategory = subcategory;
    if (note != null) updates.note = note;

    if (Object.keys(updates).length === 0) {
      return toolError("No fields provided to update.");
    }

    const { data, error } = await ac.client
      .from("transactions")
      .update(updates)
      .eq("id", expenseId)
      .select()
      .single();

    if (error || !data) return toolError(`Update failed: ${error?.message ?? "no rows affected"}`);

    return withPendingHint({
      status: "success",
      message: "Expense updated successfully.",
      updated: data,
    }, ac);
  } catch (e) {
    return { result: toolError(`Edit failed: ${String(e)}`) };
  }
}

export async function monthlyReport(
  apiKey: string,
  month: number,
  year: number,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);

    const lastDay = new Date(year, month, 0).getDate();
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: rows, error } = await ac.client
      .from("transactions")
      .select("id,expense_date,amount,category,subcategory,note")
      .is("group_id", null)
      .gte("expense_date", start)
      .lte("expense_date", end)
      .order("expense_date", { ascending: true });

    if (error) return { result: toolError(`monthly_report: ${error.message}`) };

    const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });

    if (!rows || rows.length === 0) {
      return withPendingHint({
        month: `${monthName} ${year}`,
        message: "No expenses recorded this month.",
        total_spent: 0,
      }, ac);
    }

    let total = 0;
    const categoryBuckets: Record<string, number> = {};
    const dailyTotals: Record<string, number> = {};
    const weekdayTotals: Record<string, number> = {
      Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0,
      Friday: 0, Saturday: 0, Sunday: 0,
    };
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let biggest = { amount: 0, category: "", note: "", date: "" };

    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      const cat = (r.category as string) || "Other";
      const dateStr = r.expense_date as string;
      const note = (r.note as string) || "";

      total += amt;
      categoryBuckets[cat] = (categoryBuckets[cat] ?? 0) + amt;
      dailyTotals[dateStr] = (dailyTotals[dateStr] ?? 0) + amt;

      if (amt > biggest.amount) biggest = { amount: amt, category: cat, note, date: dateStr };

      try {
        const [y, m, d] = dateStr.split("-").map(Number);
        const weekday = DAYS[new Date(y, m - 1, d).getDay()];
        weekdayTotals[weekday] = (weekdayTotals[weekday] ?? 0) + amt;
      } catch { /* skip */ }
    }

    const topCategories = Object.entries(categoryBuckets)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        category: cat,
        total: Math.round(amt * 100) / 100,
        percentage: Math.round((amt / total) * 1000) / 10,
      }));

    const busiestDay = Object.entries(dailyTotals).sort((a, b) => b[1] - a[1])[0];
    const weekend = (weekdayTotals.Saturday ?? 0) + (weekdayTotals.Sunday ?? 0);
    const weekday = total - weekend;

    return withPendingHint({
      month: `${monthName} ${year}`,
      total_spent: Math.round(total * 100) / 100,
      transaction_count: rows.length,
      top_categories: topCategories,
      biggest_expense: {
        amount: Math.round(biggest.amount * 100) / 100,
        category: biggest.category,
        note: biggest.note,
        date: biggest.date,
      },
      busiest_day: {
        date: busiestDay?.[0] ?? null,
        total: Math.round((busiestDay?.[1] ?? 0) * 100) / 100,
      },
      weekday_vs_weekend: {
        weekdays_total: Math.round(weekday * 100) / 100,
        weekends_total: Math.round(weekend * 100) / 100,
        weekend_percentage: total > 0 ? Math.round((weekend / total) * 1000) / 10 : 0,
      },
      daily_totals: Object.entries(dailyTotals)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, t]) => ({ date, total: Math.round(t * 100) / 100 })),
    }, ac);
  } catch (e) {
    return { result: toolError(`monthly_report: ${String(e)}`) };
  }
}
