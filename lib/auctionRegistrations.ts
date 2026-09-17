import { persistTermsAgreement } from "@/lib/helcim";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export type AuctionRegistration = {
  userId: string;
  eventId: string;
  termsAgreedAt: string;
  preauthAgreedAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderAuctionRegs: Map<string, AuctionRegistration> | undefined;
}

function key(userId: string, eventId: string) {
  return `${userId}:${eventId}`;
}

function memory() {
  if (!globalThis.__dealfinderAuctionRegs) {
    globalThis.__dealfinderAuctionRegs = new Map();
  }
  return globalThis.__dealfinderAuctionRegs;
}

export async function hasAuctionRegistration(userId: string, eventId: string) {
  if (memory().has(key(userId, eventId))) return true;
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return false;
  const { data, error } = await supabase
    .from("auction_registrations")
    .select("user_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error && /auction_registrations|schema cache|does not exist/i.test(error.message)) {
    return false;
  }
  return Boolean(data);
}

export async function saveAuctionRegistration(userId: string, eventId: string) {
  const now = new Date().toISOString();
  const row: AuctionRegistration = {
    userId,
    eventId,
    termsAgreedAt: now,
    preauthAgreedAt: now,
  };
  memory().set(key(userId, eventId), row);
  await persistTermsAgreement(userId, true);

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return row;
  const { error } = await supabase.from("auction_registrations").upsert(
    {
      user_id: userId,
      event_id: eventId,
      terms_agreed_at: now,
      preauth_agreed_at: now,
    },
    { onConflict: "user_id,event_id" },
  );
  if (error && /auction_registrations|schema cache|does not exist/i.test(error.message)) {
    return row;
  }
  if (error) throw new Error(error.message);
  return row;
}

export async function listAuctionRegistrations(eventId: string) {
  const local = Array.from(memory().values()).filter((row) => row.eventId === eventId);
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return local;
  const { data, error } = await supabase
    .from("auction_registrations")
    .select("user_id, event_id, terms_agreed_at, preauth_agreed_at")
    .eq("event_id", eventId);
  if (error || !data) return local;
  const mapped = data.map((row) => ({
    userId: String(row.user_id),
    eventId: String(row.event_id),
    termsAgreedAt: String(row.terms_agreed_at),
    preauthAgreedAt: String(row.preauth_agreed_at),
  }));
  const seen = new Set(mapped.map((row) => row.userId));
  for (const row of local) {
    if (!seen.has(row.userId)) mapped.push(row);
  }
  return mapped;
}
