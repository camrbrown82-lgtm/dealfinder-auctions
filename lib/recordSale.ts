import { emptyMark, type SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { upsertDemoInvoice } from "@/lib/demoSettlementStore";
import { upsertSettlementInvoice } from "@/lib/settlementDb";
import { settlementInvoice } from "@/lib/payments";
import { invoiceFees } from "@/lib/invoiceFees";
import { sendWinInvoiceEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";
import type { BidderProfile } from "@/lib/profileTypes";

function addressOf(profile: Pick<BidderProfile, "street" | "city" | "province" | "postalCode"> | null) {
  if (!profile) return "No shipping profile on file";
  const line = [profile.street, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ");
  return line || "No shipping profile on file";
}

function applyFees(row: SettlementInvoiceRecord) {
  const hammer = row.lots.reduce((sum, lot) => sum + Number(lot.hammer ?? 0), 0);
  const fees = invoiceFees({
    hammer,
    fulfillment: row.fulfillment,
    shippingCost: row.shippingCost,
  });
  row.hammer = fees.hammer;
  row.premium = fees.premium;
  row.handling = fees.handling;
  row.gst = fees.gst;
  row.shippingCost = fees.shipping;
  row.total = fees.total;
  return fees;
}

export async function recordSoldLotSettlement(
  lot: AuctionLot,
  buyer: {
    id?: string | null;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    paymentMethod?: string | null;
  },
  auctionNumber?: string | null,
) {
  const buyerKey = buyer.id || buyer.fullName || buyer.email || "floor";
  const invoice = settlementInvoice(auctionNumber ?? lot.auctionNumber, String(buyerKey));
  const soldLot = {
    id: lot.id,
    title: lot.title,
    lotNumber: lot.lotNumber ?? null,
    hammer: lot.currentBid,
  };
  const row: SettlementInvoiceRecord = {
    invoice,
    eventId: lot.eventId ?? null,
    buyerKey: String(buyerKey),
    name: buyer.fullName || buyer.email || "Floor bidder",
    email: buyer.email ?? "",
    phone: buyer.phone ?? "",
    address: addressOf(
      buyer.street || buyer.city
        ? {
            street: buyer.street ?? "",
            city: buyer.city ?? "",
            province: buyer.province ?? "",
            postalCode: buyer.postalCode ?? "",
          }
        : null,
    ),
    paymentMethod: buyer.paymentMethod ?? "",
    lots: [soldLot],
    total: soldLot.hammer,
    ...emptyMark(),
    fulfillment: lot.fulfillment === "ship" || lot.fulfillment === "pickup" ? lot.fulfillment : "unset",
    shippingCost: lot.shippingCost ?? 0,
  };

  let alreadyEmailed = false;
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    try {
      const existing = await supabase
        .from("settlement_invoices")
        .select("*")
        .eq("invoice_number", invoice)
        .maybeSingle();
      if (existing.data) {
        const currentLots = Array.isArray(existing.data.lots) ? existing.data.lots : [];
        const lots = [
          ...currentLots.filter((item: { id?: string }) => item.id !== lot.id),
          soldLot,
        ];
        row.lots = lots;
        row.payment =
          existing.data.payment_status === "partial" ||
          existing.data.payment_status === "paid" ||
          existing.data.payment_status === "cash_pending"
            ? existing.data.payment_status
            : "unpaid";
        row.paymentChannel = existing.data.payment_channel === "cash" ? "cash" : "helcim";
        row.shipping =
          existing.data.shipping_status === "ready" ||
          existing.data.shipping_status === "shipped" ||
          existing.data.shipping_status === "picked_up"
            ? existing.data.shipping_status
            : "pending";
        row.notes = String(existing.data.notes ?? "");
        row.fulfillment =
          existing.data.fulfillment === "ship" || existing.data.fulfillment === "pickup"
            ? existing.data.fulfillment
            : row.fulfillment;
        row.shippingCost = Number(existing.data.shipping_cost ?? row.shippingCost ?? 0);
        alreadyEmailed = Boolean(existing.data.win_email_sent_at);
      }
      applyFees(row);
      await upsertSettlementInvoice(supabase, row);
    } catch (error) {
      console.error("recordSoldLotSettlement", error instanceof Error ? error.message : error);
    }
  } else {
    applyFees(row);
    upsertDemoInvoice(row);
  }

  const fees = applyFees(row);
  if (!alreadyEmailed && buyer.email) {
    void sendWinInvoiceEmail({
      to: buyer.email,
      name: row.name,
      title: row.lots.map((item) => item.title).join(", "),
      invoice: row.invoice,
      lotId: lot.id,
      slug: lot.slug,
      fees,
      fulfillment: row.fulfillment ?? "unset",
      address: row.address,
    });
    if (isSupabaseConfigured && supabase) {
      await supabase
        .from("settlement_invoices")
        .update({ win_email_sent_at: new Date().toISOString() })
        .eq("invoice_number", invoice);
    }
  }
}
