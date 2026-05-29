/**
 * JWT subject extraction — mirrors jwt_sub.py.
 * Opaque decode only; token is already trusted (issued by Supabase).
 *
 * Single Responsibility: extract user UUID from a JWT string.
 */

export function jwtSubject(accessToken: string): string {
  const parts = accessToken.trim().split(".");
  if (parts.length !== 3) throw new Error("Not a JWT (expected three segments).");

  const body = parts[1];
  // Base64url → Base64 → decode
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64").toString("utf-8");
  const payload = JSON.parse(decoded) as Record<string, unknown>;

  const sub = payload.sub;
  if (!sub || typeof sub !== "string") throw new Error("JWT missing sub claim.");
  return sub;
}
