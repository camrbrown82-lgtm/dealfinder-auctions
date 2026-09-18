import { BUY_NOW_LIMIT_MESSAGE, buyNowCap } from "@/lib/buyNowLimits";
import { sendWinReservationEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";
import type { BidderProfile } from "@/lib/profileTypes";

export type SaleSource = "bid" | "buy_now";

function buyerId(buyer: { id?: string | null }) {
  return String(buyer.id ?? "").trim();
}

export async function buyNowSpendForEvent(userId: string, eventId: string | null | undefined) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase || !userId) return 0;
  let query = supabase
    .from("pending_invoice_items")
    .select("hammer")
    .eq("user_id", userId)
    .eq("source", "buy_now");
  if (eventId) query = query.eq("event_id", eventId);
  else query = query.is("event_id", null);
  const { data, error } = await query;
  if (!error && data) {
    return data.reduce((sum, row) => sum + Number(row.hammer ?? 0), 0);
  }
  let lotsQuery = supabase
    .from("lots")
    .select("current_bid")
    .eq("high_bidder_id", userId)
    .eq("sale_source", "buy_now")
    .neq("status", "removed");
  if (eventId) lotsQuery = lotsQuery.eq("event_id", eventId);
  else lotsQuery = lotsQuery.is("event_id", null);
  const lots = await lotsQuery;
  return (lots.data ?? []).reduce((sum, row) => sum + Number(row.current_bid ?? 0), 0);
}

export async function assertBuyNowLimit(input: {
  session: BidderProfile;
  eventId: string | null | undefined;
  amount: number;
}) {
  const cap = buyNowCap(input.session);
  if (!Number.isFinite(cap)) return null;
  const spent = await buyNowSpendForEvent(input.session.id, input.eventId);
  if (spent + input.amount <= cap + 1e-9) return null;
  return BUY_NOW_LIMIT_MESSAGE;
}

export async function queueWonLot(
  lot: AuctionLot,
  buyer: {
    id?: string | null;
    fullName?: string | null;
    email?: string | null;
  },
  source: SaleSource,
) {
  const userId = buyerId(buyer);
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase && userId) {
    const payload = {
      user_id: userId,
      event_id: lot.eventId ?? null,
      lot_id: lot.id,
      hammer: lot.currentBid,
      source,
    };
    const existing = await supabase
      .from("pending_invoice_items")
      .select("id, reservation_email_sent_at")
      .eq("lot_id", lot.id)
      .maybeSingle();
    if (!existing.data) {
      const inserted = await supabase.from("pending_invoice_items").insert(payload);
      if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
        console.error("queueWonLot", inserted.error.message);
      }
    }
    const alreadyReserved = Boolean(existing.data?.reservation_email_sent_at);
    if (!alreadyReserved && buyer.email) {
      await sendWinReservationEmail({
        to: buyer.email,
        name: buyer.fullName || buyer.email,
        title: lot.title,
        lotNumber: lot.lotNumber ?? "",
        hammer: lot.currentBid,
        lotId: lot.id,
        slug: lot.slug,
      });
      await supabase
        .from("pending_invoice_items")
        .update({ reservation_email_sent_at: new Date().toISOString() })
        .eq("lot_id", lot.id);
    }
    return;
  }

  if (buyer.email) {
    await sendWinReservationEmail({
      to: buyer.email,
      name: buyer.fullName || buyer.email,
      title: lot.title,
      lotNumber: lot.lotNumber ?? "",
      hammer: lot.currentBid,
      lotId: lot.id,
      slug: lot.slug,
    });
  }
}
