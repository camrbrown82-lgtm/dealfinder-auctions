import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvLocal();

const base = process.env.PURGE_BASE_URL || "http://127.0.0.1:43173";
const password = process.env.ADMIN_PASSWORD || "hammer";

async function main() {
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = login.headers.get("set-cookie") || "";
  if (!login.ok) {
    throw new Error(`admin login failed: ${login.status}`);
  }
  const purge = await fetch(`${base}/api/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({ action: "purge-test-data" }),
  });
  const json = await purge.json();
  if (!purge.ok) {
    throw new Error(json.error || `purge failed: ${purge.status}`);
  }
  const clock = await fetch(`${base}/api/live-clock`, { cache: "no-store" });
  const live = await clock.json();
  console.log(
    JSON.stringify(
      {
        purge: json,
        liveSource: live.source,
        liveHost: live.supabaseHost,
        liveLotCount: Array.isArray(live.lots) ? live.lots.length : -1,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
