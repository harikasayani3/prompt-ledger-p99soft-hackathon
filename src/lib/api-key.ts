// MCP api_key + cached profile in localStorage. Identity owned by Supabase auth;
// AuthSync (in __root) mirrors the Supabase user into localStorage so synchronous
// helpers like getLocalUser() keep working from anywhere in the app.

const KEY = "mcp.api_key";
const EMAIL = "mcp.email";
const NAME = "mcp.name";

export type LocalUser = { apiKey: string; email: string; name?: string };

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setApiKey(apiKey: string) {
  localStorage.setItem(KEY, apiKey);
}

export function clearApiKey() {
  localStorage.removeItem(KEY);
}

export function getLocalUser(): LocalUser | null {
  if (typeof window === "undefined") return null;
  const apiKey = localStorage.getItem(KEY) ?? "";
  const email = localStorage.getItem(EMAIL) ?? "";
  if (!email) return null;
  return { apiKey, email, name: localStorage.getItem(NAME) ?? undefined };
}

export function setLocalProfile(p: { email: string; name?: string }) {
  localStorage.setItem(EMAIL, p.email);
  if (p.name) localStorage.setItem(NAME, p.name);
}

export function clearLocalUser() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(EMAIL);
  localStorage.removeItem(NAME);
}
