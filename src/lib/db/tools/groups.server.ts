/**
 * Group management tools.
 * Mirrors the group management section of server.py.
 *
 * Single Responsibility: group lifecycle (create, list, invite, join, leave, members).
 */

import { getClientForApiKey } from "../supabase.server";
import { jwtSubject } from "../jwt.server";
import { withPendingHint, toolError } from "../pending-hint.server";

export async function createGroup(
  apiKey: string,
  name: string,
  kind = "trip",
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_create_group", {
      p_name: name,
      p_kind: kind,
    });
    if (error) return { result: toolError(`fn_create_group: ${error.message}`) };
    return withPendingHint({ status: "success", group_id: data as string }, ac);
  } catch (e) {
    return { result: toolError(`fn_create_group: ${String(e)}`) };
  }
}

export async function listMyGroups(apiKey: string): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data: memberships, error: memErr } = await ac.client
      .from("group_members")
      .select("group_id,role")
      .eq("user_id", uid);

    if (memErr) return { result: toolError(`list_my_groups: ${memErr.message}`) };

    const gids = (memberships ?? []).map((r) => r.group_id as string);
    if (gids.length === 0) return withPendingHint([], ac);

    const { data: groups, error: grpErr } = await ac.client
      .from("groups")
      .select("id,name,kind,created_at,settings")
      .in("id", gids);

    if (grpErr) return { result: toolError(`list_my_groups: ${grpErr.message}`) };
    return withPendingHint(groups ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_my_groups: ${String(e)}`) };
  }
}

export async function createGroupInvite(
  apiKey: string,
  groupId: string,
  expiresInDays = 7,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_create_group_invite", {
      p_group_id: groupId,
      p_expires_in_days: expiresInDays,
    });
    if (error) return { result: toolError(`fn_create_group_invite: ${error.message}`) };
    return withPendingHint({ status: "success", invite_code: data as string }, ac);
  } catch (e) {
    return { result: toolError(`fn_create_group_invite: ${String(e)}`) };
  }
}

export async function redeemGroupInvite(
  apiKey: string,
  inviteCode: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_redeem_group_invite", {
      p_code: inviteCode.trim().toLowerCase(),
    });
    if (error) return { result: toolError(`redeem_group_invite: ${error.message}`) };
    return withPendingHint({ status: "success", group_id: data as string }, ac);
  } catch (e) {
    return { result: toolError(`redeem_group_invite: ${String(e)}`) };
  }
}

export async function listGroupMembers(
  apiKey: string,
  groupId: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client
      .from("group_members")
      .select("user_id,role,joined_at")
      .eq("group_id", groupId);
    if (error) return { result: toolError(`list_group_members: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_group_members: ${String(e)}`) };
  }
}

export async function leaveGroup(
  apiKey: string,
  groupId: string,
): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_leave_group", { p_group_id: groupId });
    if (error) return { result: toolError(`leave_group: ${error.message}`) };
    return withPendingHint(
      typeof data === "object" && data !== null ? data : { status: "success" },
      ac,
    );
  } catch (e) {
    return { result: toolError(`leave_group: ${String(e)}`) };
  }
}
