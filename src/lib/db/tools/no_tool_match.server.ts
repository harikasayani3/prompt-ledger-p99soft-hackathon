import { getClientForApiKey } from "../supabase.server";
import Groq from "groq-sdk";

function isReadSql(sql: string): boolean {
  const upper = sql.trim().toUpperCase();
  return (
    (upper.startsWith("SELECT") || upper.startsWith("WITH")) && upper.includes("FROM") &&
    !/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/.test(upper)
  );
}

async function runQuery(
  client: ReturnType<typeof getClientForApiKey> extends Promise<infer T> ? T : never,
  query: string
): Promise<unknown[]> {
  const { data, error } = await (client as any).client.rpc("exec_sql", { query });
  if (error) throw new Error(`exec_sql RPC error: ${error.message}`);
  return data ?? [];
}

// Formats raw schema rows into a readable string for the LLM prompt
function formatSchema(
  tables: unknown[],
  primaryKeys: unknown[],
  foreignKeys: unknown[]
): string {
  // Group columns by table
  const tableMap = new Map<string, { col: string; type: string; nullable: string }[]>();
  for (const row of tables as any[]) {
    if (!tableMap.has(row.table_name)) tableMap.set(row.table_name, []);
    tableMap.get(row.table_name)!.push({
      col: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
    });
  }

  const pkSet = new Set(
    (primaryKeys as any[]).map((r) => `${r.table_name}.${r.column_name}`)
  );

  let out = "";
  for (const [table, cols] of tableMap) {
    out += `Table: ${table}\n`;
    for (const c of cols) {
      const pk = pkSet.has(`${table}.${c.col}`) ? " [PK]" : "";
      const nullable = c.nullable === "YES" ? "" : " NOT NULL";
      out += `  - ${c.col}: ${c.type}${pk}${nullable}\n`;
    }
    out += "\n";
  }

  if ((foreignKeys as any[]).length) {
    out += "Foreign Keys:\n";
    for (const fk of foreignKeys as any[]) {
      out += `  ${fk.from_table}.${fk.from_column} → ${fk.to_table}.${fk.to_column}\n`;
    }
  }

  return out;
}

export async function noToolMatch(
  apiKey: string,
  inputText: string
): Promise<Record<string, unknown>> {
  let ac;
  let userId: string | undefined;
  try {
    ac = await getClientForApiKey(apiKey);
    const payload = JSON.parse(atob(ac.accessToken.split(".")[1]));
    userId = payload.sub;
    console.log("userId:", userId);
  } catch (e) {
    return { status: "error", message: `Auth failed: ${String(e)}` };
  }

  let schemaContext: string;
  try {
    const [tables, primaryKeys, foreignKeys] = await Promise.all([
      runQuery(ac, `
        SELECT t.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
      `),
      runQuery(ac, `
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
      `),
      runQuery(ac, `
        SELECT kcu.table_name AS from_table, kcu.column_name AS from_column,
               ccu.table_name AS to_table, ccu.column_name AS to_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      `),
    ]);

    schemaContext = formatSchema(tables, primaryKeys, foreignKeys);

    if (!schemaContext.trim()) {
      return {
        status: "error",
        message:
          "Could not retrieve schema — ensure the exec_sql RPC exists in your Supabase project.",
      };
    }
  } catch (e) {
    return { status: "error", message: `Schema fetch failed: ${String(e)}` };
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  let sql: string;
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content:
            "You are a PostgreSQL expert. Output ONLY raw SQL — no markdown, no backticks, no explanation. " +
    "Write a single read-only SELECT query. NEVER use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, " +
    "TRUNCATE, GRANT, or REVOKE. If the question cannot be answered with a SELECT, output exactly: " +
    "IMPORTANT: Always filter by the current user. The user's ID comes from the 'submitted_by' column. " +
    "Use the following user_id for all queries: " + userId + "\n\n" +
    "SELECT 1 WHERE false\n\n" +
    "IMPORTANT PostgreSQL rules:\n" +
    "- Window functions (LAG, LEAD, RANK, etc.) CANNOT be used inside WHERE or HAVING.\n" +
    "- To filter on a window function, wrap it in a CTE first, then filter in the outer query.\n\n" +
    "Example — months where spending increased >20%:\n" +
    "WITH monthly AS (\n" +
    "  SELECT DATE_TRUNC('month', expense_date) AS month, SUM(amount) AS total\n" +
    "  FROM transactions GROUP BY 1\n" +
    "),\n" +
    "with_prev AS (\n" +
    "  SELECT month, total, LAG(total) OVER (ORDER BY month) AS prev_total FROM monthly\n" +
    ")\n" +
    "SELECT month, total, prev_total FROM with_prev\n" +
    "WHERE prev_total IS NOT NULL AND total > prev_total * 1.2\n" +
    "ORDER BY month;"
        },
        {
          role: "user",
          content: `Schema:\n${schemaContext}\n\nQuestion: ${inputText}`,
        },
      ],
    });

    sql = response.choices[0].message.content?.trim().replace(/;$/, "").replace(/```sql|```/gi, "").trim() ?? "";
  } catch (e) {
    console.log("Groq error:", e);
    return { status: "error", message: `LLM call failed: ${String(e)}` };
  }

  console.log("Generated SQL:", sql);

  if (!sql || !isReadSql(sql)) {
    return {
      status: "error",
      message: `Generated query is not a safe SELECT. Got: ${sql?.slice(0, 120)}`,
    };
  }

  try {
    const rows = await runQuery(ac, sql);
    console.log("Query result:", rows);
    return { result: { status: "success", data: rows, query: sql } };
  } catch (e) {
    console.log("Query execution error:", e);
    return { status: "error", message: `Query execution failed: ${String(e)}`, query: sql };
  }
}