import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CONSIGNMENT_IMAGES_BUCKET } from "../lib/consignmentStorage";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
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

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/i, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  "bids",
  "absentee_bids",
  "auction_registrations",
  "lots",
  "consignments",
  "auction_events",
  "settlement_invoices",
  "settlement_archives",
  "helcim_sessions",
  "helcim_transactions",
  "profiles",
] as const;

async function wipeTable(table: string) {
  const attempts = [
    () => supabase.from(table).delete({ count: "exact" }).not("id", "is", null),
    () => supabase.from(table).delete({ count: "exact" }).gte("created_at", "1970-01-01"),
    () => supabase.from(table).delete({ count: "exact" }).not("checkout_token", "is", null),
    () => supabase.from(table).delete({ count: "exact" }).not("invoice_number", "is", null),
  ];
  let lastError = "";
  for (const attempt of attempts) {
    const { error, count } = await attempt();
    if (!error) return count ?? 0;
    lastError = error.message;
    if (/column|schema cache/i.test(error.message)) continue;
    throw new Error(`${table}: ${error.message}`);
  }
  throw new Error(`${table}: ${lastError || "could not delete rows"}`);
}

async function listAll(prefix = ""): Promise<string[]> {
  const { data, error } = await supabase.storage.from(CONSIGNMENT_IMAGES_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    if (/not found|does not exist/i.test(error.message)) return [];
    throw new Error(`storage list: ${error.message}`);
  }
  const paths: string[] = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      paths.push(...(await listAll(path)));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

async function wipeAuthUsers() {
  let removed = 0;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data.users ?? [];
    if (!users.length) break;
    for (const user of users) {
      const deleted = await supabase.auth.admin.deleteUser(user.id);
      if (deleted.error) throw new Error(`deleteUser ${user.email}: ${deleted.error.message}`);
      removed += 1;
    }
    if (users.length < 200) break;
  }
  return removed;
}

async function main() {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    try {
      counts[table] = await wipeTable(table);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/schema cache|does not exist|relation/i.test(message)) {
        counts[table] = -1;
        continue;
      }
      throw error;
    }
  }

  const users = await wipeAuthUsers();
  await supabase.from("house_desk_settings").update({ next_lot_seq: 1 }).eq("id", 1);

  let files = 0;
  try {
    const paths = await listAll();
    if (paths.length) {
      const { error } = await supabase.storage.from(CONSIGNMENT_IMAGES_BUCKET).remove(paths);
      if (error) throw new Error(`storage remove: ${error.message}`);
      files = paths.length;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("storage", message);
  }

  const leftoverUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 5 });
  const leftoverLots = await supabase.from("lots").select("id, title");
  const leftoverProfiles = await supabase.from("profiles").select("id");

  const listed = await fetch(`${url}/rest/v1/lots?select=id,title&limit=8`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const listedBody = await listed.text();

  console.log(
    JSON.stringify(
      {
        ok: true,
        project: new URL(url).host,
        restLotsStatus: listed.status,
        restLotsPreview: listedBody.slice(0, 400),
        deletedRows: counts,
        deletedAuthUsers: users,
        deletedStorageObjects: files,
        remaining: {
          authUsers: leftoverUsers.data?.users?.length ?? leftoverUsers.data?.users?.length,
          lots: leftoverLots.data?.length ?? leftoverLots.count ?? 0,
          lotTitles: (leftoverLots.data ?? []).map((row) => row.title).slice(0, 8),
          profiles: leftoverProfiles.data?.length ?? leftoverProfiles.count ?? 0,
        },
        kept: ["df_admin cookie / ADMIN_PASSWORD", "email_templates", "email_settings", "house_desk_settings"],
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
