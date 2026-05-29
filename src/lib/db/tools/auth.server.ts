/**
 * Auth tools — register_new_user, login_get_api_key.
 * No api_key required; uses anonymous Supabase client.
 *
 * Mirrors the auth section of server.py.
 */

import { getAnonClient } from "../supabase.server";
import { toolError } from "../pending-hint.server";

export async function registerNewUser(
  email: string,
  password: string,
  fullName = "",
): Promise<Record<string, unknown>> {
  try {
    const client = getAnonClient();

    const { data: authData, error: authErr } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (authErr || !authData.user) {
      return toolError(`Registration failed: ${authErr?.message ?? "could not create user"}`);
    }
    if (!authData.session) {
      return toolError(
        "User created but no session returned. " +
        "Disable 'Confirm email' in Supabase → Authentication → Providers → Email.",
      );
    }

    const userId = authData.user.id;
    const accessToken = authData.session.access_token;
    const refreshToken = authData.session.refresh_token ?? "";

    // Authenticate the client for the RPC call
    const authedClient = getAnonClient();
    authedClient.functions.setAuth(accessToken);

    const { data: apiKey, error: keyErr } = await client.rpc("fn_generate_api_key", {
      p_user_id: userId,
      p_key_name: "Default Key",
      p_refresh_token: refreshToken,
    });

    if (keyErr || !apiKey) {
      return toolError("User created but API key generation failed.");
    }

    return {
      status: "success",
      user_id: userId,
      email,
      api_key: apiKey as string,
      message: "Registration successful! Save your API key — it won't be shown again.",
    };
  } catch (e) {
    return toolError(`Registration failed: ${String(e)}`);
  }
}

export async function loginGetApiKey(
  email: string,
  password: string,
): Promise<Record<string, unknown>> {
  try {
    const client = getAnonClient();

    const { data: authData, error: authErr } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (authErr || !authData.user || !authData.session) {
      return toolError("Login failed: Invalid login credentials");
    }

    const userId = authData.user.id;
    const accessToken = authData.session.access_token;
    const refreshToken = authData.session.refresh_token ?? "";

    // Authenticate for table/RPC access
    const authedClient = getAnonClient();
    authedClient.functions.setAuth(accessToken);

    // Check for existing active key
    const { data: existing } = await client
      .from("api_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    let apiKey: string;

    if (existing && existing.length > 0) {
      apiKey = existing[0].api_key as string;
      // Update refresh token for future calls
      await client.rpc("fn_update_api_key_refresh_token", {
        p_api_key: apiKey,
        p_refresh_token: refreshToken,
      });
    } else {
      const { data: newKey, error: keyErr } = await client.rpc("fn_generate_api_key", {
        p_user_id: userId,
        p_key_name: "Login Key",
        p_refresh_token: refreshToken,
      });
      if (keyErr || !newKey) {
        return toolError("Login succeeded but API key generation failed.");
      }
      apiKey = newKey as string;
    }

    return {
      status: "success",
      user_id: userId,
      email,
      api_key: apiKey,
      message: "Login successful!",
    };
  } catch (e) {
    return toolError(`Login failed: ${String(e)}`);
  }
}
