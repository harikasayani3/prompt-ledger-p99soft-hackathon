/**
 * _with_pending_hint equivalent.
 *
 * Wraps any tool result in { result: payload } and optionally attaches
 * pending_approvals_summary when the user has items waiting for approval.
 *
 * Single Responsibility: result envelope + pending count decoration.
 */

import type { AuthedClient } from "./supabase.server";
import { jwtSubject } from "./jwt.server";

export interface ToolResult<T = unknown> {
  result: T;
  pending_approvals_summary?: {
    count: number;
    items: unknown[];
  };
}

export async function withPendingHint<T>(payload: T, ac: AuthedClient): Promise<ToolResult<T>> {
  try {
    const uid = jwtSubject(ac.accessToken);
    const base: ToolResult<T> = { result: payload };

    const { data } = await ac.client.rpc("fn_get_pending_count", { p_user_id: uid });
    if (data && Array.isArray(data) && data.length > 0) {
      const row = data[0] as { count?: number; sample?: unknown[] };
      const count = row.count ?? 0;
      if (count > 0) {
        base.pending_approvals_summary = { count, items: row.sample ?? [] };
      }
    }
    return base;
  } catch {
    return { result: payload };
  }
}

/** Standard error shape — mirrors _err() in Python. */
export function toolError(message: string): { status: "error"; message: string } {
  return { status: "error", message };
}
