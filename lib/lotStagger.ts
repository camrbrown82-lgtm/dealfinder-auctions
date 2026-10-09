import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

/** First lot entered closes on the auction hammer. Each later lot closes 30 seconds after the one before it. */
export const LOT_STAGGER_MS = 30 * 1000;

type StaggerRow = {
  id: string;
  created_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  sale_channel?: string | null;
};

function createdMs(row: StaggerRow) {
  const ms = new Date(String(row.created_at ?? "")).getTime();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export function staggerOrder(rows: StaggerRow[]) {
  return rows
    .filter((row) => row.sale_channel !== "buy_now" && row.status !== "removed" && row.status !== "draft")
    .sort((a, b) => createdMs(a) - createdMs(b) || a.id.localeCompare(b.id));
}

export function lotClosesAt(eventEndsAt: string, index: number) {
  const end = new Date(eventEndsAt).getTime();
  if (!Number.isFinite(end)) return eventEndsAt;
  return new Date(end + index * LOT_STAGGER_MS).toISOString();
}

export async function applySaleStagger(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  eventId: string,
  eventEndsAt: string,
  reset = false,
) {
  const { data, error } = await supabase
    .from("lots")
    .select("id, created_at, ends_at, status, sale_channel")
    .eq("event_id", eventId);
  if (error || !data) return;
  const eventMs = new Date(eventEndsAt).getTime();
  const ordered = staggerOrder(data as StaggerRow[]);
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    if (row.status === "ended" || row.status === "removed") continue;
    const scheduled = lotClosesAt(eventEndsAt, index);
    const currentMs = new Date(String(row.ends_at ?? "")).getTime();
    const scheduledMs = new Date(scheduled).getTime();
    const stillOnTheHammer = Number.isFinite(currentMs) && Math.abs(currentMs - eventMs) < 2000;
    if (!reset && !stillOnTheHammer && Number.isFinite(currentMs) && currentMs >= scheduledMs) continue;
    if (row.ends_at === scheduled) continue;
    await supabase.from("lots").update({ ends_at: scheduled }).eq("id", row.id);
  }
}

/** Give every open sale its 30-second close ladder before clocks are settled. */
export async function ensureStaggeredClocks() {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data: events } = await supabase
    .from("auction_events")
    .select("id, ends_at, archived_at")
    .is("archived_at", null);
  const now = Date.now();
  for (const event of events ?? []) {
    const ends = new Date(String(event.ends_at ?? "")).getTime();
    if (!Number.isFinite(ends) || ends <= now) continue;
    await applySaleStagger(supabase, String(event.id), String(event.ends_at), false);
  }
}
