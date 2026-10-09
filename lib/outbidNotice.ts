import { isOutbidClosingWindow } from "@/lib/auctionEndDay";
import { sendOutbidEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const CLOSING_LOOKAHEAD_MS = 6 * 60 * 60 * 1000;

export function endsWithinHours(endsAt: string | null | undefined, now = Date.now()) {
  if (!endsAt) return false;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return false;
  const left = end - now;
  return left > 0 && left <= THREE_HOURS_MS;
}

export function outbidNoticeId(kind: "first" | "close", lotId: string, bidderKey: string) {
  return `outbid-${kind}|${lotId}|${bidderKey}`;
}

/** True the first time this id is stored. A repeat means that email was already claimed. */
export async function claimOutbidNotice(id: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return true;
  const inserted = await supabase
    .from("email_settings")
    .insert({ id, logo_data_url: new Date().toISOString() })
    .select("id");
  if (!inserted.error) return true;
  if (/duplicate|unique/i.test(inserted.error.message)) return false;
  console.error("outbid notice", inserted.error.message);
  return false;
}

export async function releaseOutbidNotice(id: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.from("email_settings").delete().eq("id", id);
}

type ClosingLot = {
  id: string;
  title: string | null;
  slug: string | null;
  current_bid: number | string | null;
  high_bidder_id: string | null;
  high_bidder: string | null;
};

function stillOut(lot: ClosingLot, bidderKey: string, bidderName?: string | null) {
  if (lot.high_bidder_id && bidderKey === lot.high_bidder_id) return false;
  if (bidderName && lot.high_bidder && bidderName === lot.high_bidder) return false;
  if (bidderKey.startsWith("name:") && bidderKey.slice(5) === String(lot.high_bidder ?? "")) return false;
  return true;
}

export async function sendOutbidClosingReminders(now = new Date()) {
  if (!isOutbidClosingWindow(now)) return { ok: true, skipped: "outside-window" };
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { ok: false, skipped: "no-database" };

  const horizon = new Date(now.getTime() + CLOSING_LOOKAHEAD_MS).toISOString();
  const { data: lots, error: lotError } = await supabase
    .from("lots")
    .select("id, title, slug, current_bid, high_bidder_id, high_bidder, ends_at, status")
    .gt("ends_at", now.toISOString())
    .lte("ends_at", horizon)
    .neq("status", "removed")
    .neq("status", "ended");
  if (lotError) return { ok: false, error: lotError.message };

  const byId = new Map((lots ?? []).map((lot) => [String(lot.id), lot as ClosingLot]));
  if (!byId.size) return { ok: true, sent: 0, skipped: "no-lots" };

  const { data: bids, error: bidError } = await supabase
    .from("bids")
    .select("lot_id, bidder_id, bidder_name")
    .in("lot_id", Array.from(byId.keys()));
  if (bidError) return { ok: false, error: bidError.message };

  const seen = new Set<string>();
  let sent = 0;
  let skipped = 0;
  for (const bid of bids ?? []) {
    const lot = byId.get(String(bid.lot_id));
    const bidderKey = bid.bidder_id
      ? String(bid.bidder_id)
      : bid.bidder_name
        ? `name:${bid.bidder_name}`
        : "";
    if (!lot || !bidderKey) continue;
    const pair = `${lot.id}|${bidderKey}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    if (!stillOut(lot, bidderKey, bid.bidder_name ? String(bid.bidder_name) : null)) {
      skipped += 1;
      continue;
    }
    const claimed = await claimOutbidNotice(outbidNoticeId("close", lot.id, bidderKey));
    if (!claimed) {
      skipped += 1;
      continue;
    }
    const contact = await contactForBidder(bidderKey);
    if (!contact) {
      await releaseOutbidNotice(outbidNoticeId("close", lot.id, bidderKey));
      skipped += 1;
      continue;
    }
    const result = await sendOutbidEmail({
      to: contact.email,
      name: contact.name,
      title: String(lot.title ?? "Lot"),
      currentBid: Number(lot.current_bid ?? 0),
      lotId: lot.id,
      slug: lot.slug,
      closing: true,
    });
    if (result.ok) sent += 1;
  }

  return { ok: true, sent, skipped };
}

async function contactForBidder(bidderKey: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const id = bidderKey.startsWith("name:") ? "" : bidderKey;
  const name = bidderKey.startsWith("name:") ? bidderKey.slice(5) : "";
  if (id) {
    const byId = await supabase.from("profiles").select("email, full_name").eq("id", id).maybeSingle();
    if (byId.data?.email) {
      return { email: String(byId.data.email), name: String(byId.data.full_name || "Bidder") };
    }
  }
  if (name) {
    const byName = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("full_name", name)
      .maybeSingle();
    if (byName.data?.email) {
      return { email: String(byName.data.email), name: String(byName.data.full_name || name) };
    }
  }
  return null;
}
