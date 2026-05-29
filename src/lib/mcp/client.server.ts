// Server-only Streamable HTTP MCP client for the deployed FastMCP server.
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports

const MCP_URL =
  process.env.MCP_SERVER_URL ?? "https://expense-remote-mcp-server.onrender.com/mcp";
const PROTOCOL_VERSION = "2025-06-18";

type JsonRpcResult = {
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// Per-process session cache. New sessions are cheap so we don't over-engineer.
const sessions = new Map<string, string>(); // cacheKey -> mcp-session-id
let toolsCache: McpTool[] | null = null;
let toolsCacheAt = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonValue = any;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: JsonValue;
};

function parseSseForJsonRpc(body: string): JsonRpcResult | null {
  // FastMCP returns a single SSE "message" event per request — find the data line.
  for (const rawLine of body.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      return JSON.parse(json) as JsonRpcResult;
    } catch {
      // keep scanning — partial JSON shouldn't happen in our single-shot calls
    }
  }
  return null;
}

async function postRpc(
  method: string,
  params: unknown,
  sessionId?: string,
  id: number | string = 1,
): Promise<{ result: JsonRpcResult | null; sessionId: string | undefined }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const isNotification = method.startsWith("notifications/");
  const body = isNotification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id, method, params };

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const newSessionId = res.headers.get("mcp-session-id") ?? sessionId;

  if (isNotification) {
    // Drain body — FastMCP may return 202 with no body
    await res.text().catch(() => "");
    if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status}`);
    return { result: null, sessionId: newSessionId ?? undefined };
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MCP ${method} failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const parsed = parseSseForJsonRpc(text);
  if (!parsed) throw new Error(`MCP ${method}: no JSON-RPC payload in response`);
  if (parsed.error) {
    throw new Error(
      `MCP ${method} error ${parsed.error.code}: ${parsed.error.message}`,
    );
  }
  return { result: parsed, sessionId: newSessionId ?? undefined };
}

async function ensureSession(cacheKey: string): Promise<string> {
  const cached = sessions.get(cacheKey);
  if (cached) return cached;

  const init = await postRpc(
    "initialize",
    {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ai-expense-assistant", version: "1.0.0" },
    },
    undefined,
    1,
  );
  if (!init.sessionId) throw new Error("MCP initialize did not return a session id");

  await postRpc("notifications/initialized", {}, init.sessionId);
  sessions.set(cacheKey, init.sessionId);
  return init.sessionId;
}

async function withSession<T>(
  cacheKey: string,
  fn: (sid: string) => Promise<T>,
): Promise<T> {
  const sid = await ensureSession(cacheKey);
  try {
    return await fn(sid);
  } catch (err) {
    // Recover from expired sessions by re-initializing once.
    const msg = err instanceof Error ? err.message : String(err);
    if (/40\d|session/i.test(msg)) {
      sessions.delete(cacheKey);
      const fresh = await ensureSession(cacheKey);
      return fn(fresh);
    }
    throw err;
  }
}

/** List all tools advertised by the MCP server (5-minute cache). */
export async function listMcpTools(): Promise<McpTool[]> {
  if (toolsCache && Date.now() - toolsCacheAt < 5 * 60_000) return toolsCache;
  const tools = await withSession("__discovery__", async (sid) => {
    const { result } = await postRpc("tools/list", {}, sid, 2);
    const data = (result as { result?: { tools?: McpTool[] } } | null)?.result;
    return data?.tools ?? [];
  });
  toolsCache = tools;
  toolsCacheAt = Date.now();
  return tools;
}

export type ToolCallOutcome =
  | { ok: true; data: JsonValue; isError: false; raw: JsonValue }
  | { ok: false; error: string; isError: true; raw: JsonValue };

/**
 * Call a tool. We inject api_key automatically — callers must NOT pass it in args.
 * Pass apiKey="" to call public tools (register / login) without injecting api_key.
 */
export async function callMcpTool(
  apiKey: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallOutcome> {
  const isPublic = !apiKey;
  const cacheKey = isPublic ? "__public__" : `u:${apiKey.slice(0, 12)}`;
  const merged = isPublic ? { ...args } : { api_key: apiKey, ...args };

  return withSession(cacheKey, async (sid) => {
    const { result } = await postRpc(
      "tools/call",
      { name, arguments: merged },
      sid,
      Date.now(),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = (result as any)?.result;

    if (!payload) {
      return { ok: false, error: "Empty MCP response", isError: true, raw: null };
    }

    // Prefer structuredContent (FastMCP always sets this), fall back to parsing text content
    let data: JsonValue = payload.structuredContent;
    if (data === undefined && Array.isArray(payload.content)) {
      const text = payload.content.find((c: { type: string; text?: string }) => c.type === "text")?.text;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
    }

    // Transport-level error flag
    if (payload.isError) {
      const errMsg =
        typeof data === "string" ? data
        : (data && typeof data === "object" && "message" in data)
          ? String((data as Record<string, unknown>).message)
          : "Tool error";
      return { ok: false, error: errMsg, isError: true, raw: payload };
    }

    // FastMCP business-logic errors: { status: "error", message: "..." }  (isError is false!)
    // They appear at the top level of structuredContent.
    if (data && typeof data === "object" && (data as Record<string, unknown>).status === "error") {
      const msg = String((data as Record<string, unknown>).message ?? "Tool error");
      return { ok: false, error: msg, isError: true, raw: payload };
    }

    // Some tools wrap their payload in { result: <actual data> }
    // Unwrap it so callers always get the clean payload.
    const unwrapped =
      data &&
      typeof data === "object" &&
      "result" in data &&
      Object.keys(data as object).length === 1
        ? (data as Record<string, unknown>).result
        : data;

    return { ok: true, data: unwrapped ?? null, isError: false, raw: payload };
  });
}
