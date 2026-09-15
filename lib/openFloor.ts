import { getSupabaseAdmin } from "@/lib/supabaseClient";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekFromNow() {
  return new Date(Date.now() + WEEK_MS).toISOString();
}

function restConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return { url, key };
}

export async function patchLotRow(id: string, patch: Record<string, unknown>) {
  return patchTableRow("lots", id, patch);
}

export async function patchTableRow(table: string, id: string, patch: Record<string, unknown>) {
  const { url, key } = restConfig();
  if (!url || !key) return { ok: false, status: 0, body: "missing supabase env", data: null as Record<string, unknown>[] | null };
  const response = await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  const body = await response.text();
  let data: Record<string, unknown>[] | null = null;
  try {
    const parsed = JSON.parse(body) as unknown;
    data = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : null;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, body: body.slice(0, 400), data };
}

export async function openRows(
  rows: Array<{ id?: string; status?: string | null }>,
) {
  let paused = 0;
  const errors: string[] = [];
  const patches: Array<{ id: string; http: number; returned: number }> = [];
  for (const row of rows) {
    const id = String(row.id ?? "");
    const status = String(row.status ?? "").toLowerCase();
    if (!id || status === "removed" || status === "ended" || status === "live") continue;
    if (status === "paused") paused += 1;
    const result = await patchLotRow(id, { status: "live" });
    patches.push({ id, http: result.status, returned: result.data?.length ?? 0 });
    if (!result.ok) errors.push(result.body);
    else if (!result.data?.length) errors.push(`0 rows ${id} http ${result.status}`);
    else row.status = "live";
  }
  return { paused, error: errors.join(" ") || null, patches, serviceRole: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) };
}

/** @deprecated prefer openRows on an already-fetched catalog */
export async function openUnsoldFloors(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
) {
  const listed = await supabase.from("lots").select("*");
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return openRows(rows as Array<{ id?: string; status?: string | null }>);
}
