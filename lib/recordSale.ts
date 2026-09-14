import { emptyMark, type SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { upsertDemoInvoice } from "@/lib/demoSettlementStore";
import { upsertSettlementInvoice } from "@/lib/settlementDb";
import { settlementInvoice } from "@/lib/payments";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";
import type { BidderProfile } from "@/lib/profileTypes";

function addressOf(profile: Pick<BidderProfile, "street" | "city" | "province" | "postalCode"> | null) {
  if (!profile) return "No shipping profile on file";
  const line = [profile.street, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ");
  return line || "No shipping profile on file";
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
  };

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
        row.total = lots.reduce((sum: number, item: { hammer?: number }) => sum + Number(item.hammer ?? 0), 0);
        row.payment = existing.data.payment_status === "partial" || existing.data.payment_status === "paid"
          ? existing.data.payment_status
          : "unpaid";
        row.shipping =
          existing.data.shipping_status === "ready" ||
          existing.data.shipping_status === "shipped" ||
          existing.data.shipping_status === "picked_up"
            ? existing.data.shipping_status
            : "pending";
        row.notes = String(existing.data.notes ?? "");
      }
      await upsertSettlementInvoice(supabase, row);
    } catch (error) {
      console.error("recordSoldLotSettlement", error instanceof Error ? error.message : error);
    }
    return;
  }

  upsertDemoInvoice(row);
}
