import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const cwd = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(cwd, "..");

function loadEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv(path.join(root, ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;
  if (!url || !key) {
    console.error("missing_supabase_env");
    process.exit(1);
  }
  const ref = new URL(url).hostname.split(".")[0];
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/20260914000014_listing_grade.sql"),
    "utf8",
  );

  const check = await fetch(`${url}/rest/v1/lots?select=listing_grade&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("column_check", check.status);

  if (check.status === 200) {
    console.log("listing_grade_already_present");
    return;
  }

  const pg = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  console.log("pg_query", pg.status, (await pg.text()).slice(0, 200));

  if (token) {
    const mgmt = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    console.log("mgmt_query", mgmt.status, (await mgmt.text()).slice(0, 400));
  } else {
    console.log("no_mgmt_token");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exit(1);
});
