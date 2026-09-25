import { getAdminDemo } from "@/lib/demoAdminStore";
import { getDemoLot, registerDemoLot } from "@/lib/demoAuctionStore";
import { invoiceFees } from "@/lib/invoiceFees";
import { mapLot, type LotRow } from "@/lib/mappers";
import { invoiceNumber } from "@/lib/payments";
import { profileAddress, type BidderProfile } from "@/lib/profileTypes";
import { isBuyNowChannel, isListedBuyNow } from "@/lib/saleChannel";
import { emptyMark, type SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { upsertDemoInvoice } from "@/lib/demoSettlementStore";
import { upsertSettlementInvoice } from "@/lib/settlementDb";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";

export function buyNowHammer(lot: Pick<AuctionLot, "buyNowPrice" | "reservePrice" | "currentBid">) {
  const listed = Number(lot.buyNowPrice ?? lot.reservePrice ?? 0);
  return listed > 0 ? listed : Number(lot.currentBid) || 0;
}

async function writeBuyNowInvoice(lot: AuctionLot, session: BidderProfile) {
  const hammer = buyNowHammer(lot);
  const fees = invoiceFees({ hammer, fulfillment: lot.fulfillment ?? "unset" });
  const invoice = invoiceNumber(lot.id, session.id);
  const record: SettlementInvoiceRecord = {
    invoice,
    eventId: null,
    buyerKey: session.id,
    name: session.fullName,
    email: session.email,
    phone: session.phone,
    address: profileAddress(session),
    paymentMethod: session.paymentMethod,
    lots: [
      {
        id: lot.id,
        title: lot.title,
        lotNumber: lot.lotNumber ?? null,
        hammer,
      },
    ],
    total: fees.total,
    hammer: fees.hammer,
    premium: fees.premium,
    handling: fees.handling,
    gst: fees.gst,
    shippingCost: fees.shipping,
    fulfillment: lot.fulfillment ?? "unset",
    ...emptyMark(),
    payment: "unpaid",
    paymentChannel: "helcim",
  };
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    await upsertSettlementInvoice(supabase, record);
  } else {
    upsertDemoInvoice(record);
  }
  return record;
}

export async function claimBuyNowLot(lotId: string, session: BidderProfile) {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from("lots").select("*").eq("id", lotId).maybeSingle();
    if (error || !data) throw new Error("Lot not found.");
    const lot = mapLot(data as LotRow);
    if (!isBuyNowChannel(lot)) throw new Error("This item is not a Buy Now listing.");
    if (!isListedBuyNow(lot) && !(lot.highBidderId === session.id && lot.saleSource === "buy_now")) {
      throw new Error("This Buy Now item is no longer available.");
    }
    const alreadyYours = lot.highBidderId === session.id && lot.status === "ended";
    const hammer = buyNowHammer(lot);
    if (!alreadyYours) {
      const endedAt = new Date().toISOString();
      const patch: Record<string, unknown> = {
        current_bid: hammer,
        high_bidder: session.fullName || session.email,
        high_bidder_id: session.id,
        status: "ended",
        ends_at: endedAt,
        sale_source: "buy_now",
        sale_channel: "buy_now",
        buy_now_status: "listed",
      };
      let { error: updateError } = await supabase.from("lots").update(patch).eq("id", lot.id);
      if (updateError && /sale_channel|buy_now_status/i.test(updateError.message)) {
        const { sale_channel: _c, buy_now_status: _s, ...rest } = patch;
        ({ error: updateError } = await supabase.from("lots").update(rest).eq("id", lot.id));
      }
      if (updateError) throw new Error(updateError.message);
    }
    const claimed: AuctionLot = {
      ...lot,
      currentBid: hammer,
      highBidder: session.fullName || session.email,
      highBidderId: session.id,
      status: "ended",
      saleSource: "buy_now",
      saleChannel: "buy_now",
      buyNowStatus: "listed",
    };
    await writeBuyNowInvoice(claimed, session);
    return claimed;
  }

  const demo = getAdminDemo();
  const lot = demo.inventory.find((row) => row.id === lotId || row.slug === lotId);
  if (!lot) throw new Error("Lot not found.");
  if (!isBuyNowChannel(lot)) throw new Error("This item is not a Buy Now listing.");
  if (!isListedBuyNow(lot) && lot.highBidderId !== session.id) {
    throw new Error("This Buy Now item is no longer available.");
  }
  const hammer = buyNowHammer(lot);
  lot.currentBid = hammer;
  lot.highBidder = session.fullName || session.email;
  lot.highBidderId = session.id;
  lot.status = "ended";
  lot.endsAt = new Date().toISOString();
  lot.saleSource = "buy_now";
  lot.saleChannel = "buy_now";
  lot.buyNowStatus = "listed";
  const clock = getDemoLot(lot.id);
  if (clock) {
    clock.currentBid = hammer;
    clock.highBidder = lot.highBidder;
    clock.highBidderId = lot.highBidderId;
    clock.status = "ended";
    clock.endsAt = lot.endsAt;
  }
  registerDemoLot(lot);
  await writeBuyNowInvoice(lot, session);
  return lot;
}
