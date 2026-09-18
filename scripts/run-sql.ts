import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./env";

loadEnvLocal();

function usage() {
  console.error(`Usage:
  npx tsx scripts/run-sql.ts ping
  npx tsx scripts/run-sql.ts --from profiles --limit 5
  npx tsx scripts/run-sql.ts -c "select count(*) from public.profiles"
  npx tsx scripts/run-sql.ts supabase/sql-editor-password-reset.sql
  npx tsx scripts/run-sql.ts supabase/sql-editor-helcim.sql
`);
}

function supabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

function serviceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function databaseUrl() {
  return (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || "").trim();
}

function adminClient() {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let dollarTag: string | null = null;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += c;
      if (c === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      current += c;
      if (c === "*" && next === "/") {
        current += "/";
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += c;
      i += 1;
      continue;
    }
    if (inSingle) {
      current += c;
      if (c === "'" && next === "'") {
        current += "'";
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (c === "-" && next === "-") {
      inLineComment = true;
      current += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      current += c;
      i += 1;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      current += c;
      i += 1;
      continue;
    }
    if (c === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (c === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      i += 1;
      continue;
    }
    current += c;
    i += 1;
  }

  const stmt = current.trim();
  if (stmt) statements.push(stmt);
  return statements;
}

async function ping() {
  const url = supabaseUrl();
  const supabase = adminClient();
  const { error, count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  console.log(`Connected to ${url}`);
  console.log(`profiles: ${count ?? 0}`);
  const { error: tokenError, count: tokenCount } = await supabase
    .from("password_reset_tokens")
    .select("id", { count: "exact", head: true });
  if (tokenError) {
    console.log(`password_reset_tokens: missing (${tokenError.message})`);
    console.log("Run: npm run sql -- supabase/sql-editor-password-reset.sql");
  } else {
    console.log(`password_reset_tokens: ${tokenCount ?? 0}`);
  }
}

async function fromTable(table: string, limit: number) {
  const supabase = adminClient();
  const { data, error } = await supabase.from(table).select("*").limit(limit);
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

async function execSql(sql: string) {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL in .env.local (Supabase → Project Settings → Database → URI).",
    );
  }
  const client = new pg.Client({
    connectionString: connectionString
      .replace(/[?&]sslmode=[^&]*/gi, "")
      .replace(/[?&]uselibpqcompat=[^&]*/gi, "")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const statements = splitSql(sql);
    for (const statement of statements) {
      const preview = statement.replace(/\s+/g, " ").slice(0, 120);
      console.log(`→ ${preview}`);
      const result = await client.query(statement);
      if (result.rows?.length) {
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        console.log(`  ok (${result.rowCount ?? 0} rows)`);
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    usage();
    process.exit(1);
  }

  if (args[0] === "ping") {
    await ping();
    return;
  }

  const fromIdx = args.indexOf("--from");
  if (fromIdx !== -1) {
    const table = args[fromIdx + 1];
    if (!table) throw new Error("--from needs a table name");
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 ? Number(args[limitIdx + 1] || 20) : 20;
    await fromTable(table, Number.isFinite(limit) ? limit : 20);
    return;
  }

  const cIdx = args.indexOf("-c") !== -1 ? args.indexOf("-c") : args.indexOf("--query");
  if (cIdx !== -1) {
    const sql = args[cIdx + 1];
    if (!sql) throw new Error("-c needs a SQL string");
    await execSql(sql);
    return;
  }

  const file = args.find((arg) => !arg.startsWith("-"));
  if (!file) {
    usage();
    process.exit(1);
  }
  const sql = readFileSync(resolve(process.cwd(), file), "utf8");
  await execSql(sql);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
