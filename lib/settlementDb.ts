import {
  emptyMark,
  type PaymentMark,
  type SettlementArchiveRecord,
  type SettlementInvoiceRecord,
  type ShippingMark,
} from "@/lib/settlementRecords";
import type { SettlementLot } from "@/lib/settlements";
import type { SupabaseClient } from "@supabase/supabase-js";

function asPayment(value: unknown): PaymentMark {
  return value === "partial" || value === "paid" ? value : "unpaid";
}

function asShipping(value: unknown): ShippingMark {
  return value === "ready" || value === "shipped" || value === "picked_up" ? value : "pending";
}

function asLots(value: unknown): SettlementLot[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      lotNumber: (row.lotNumber as string | null | undefined) ?? null,
      hammer: Number(row.hammer ?? 0),
    };
  });
}

export function mapInvoiceRow(row: Record<string, unknown>): SettlementInvoiceRecord {
  return {
    invoice: String(row.invoice_number ?? ""),
    eventId: (row.event_id as string | null) ?? null,
    buyerKey: String(row.buyer_key ?? ""),
    name: String(row.buyer_name ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    address: String(row.address ?? ""),
    paymentMethod: String(row.payment_method ?? ""),
    lots: asLots(row.lots),
    total: Number(row.total ?? 0),
    hammer: Number(row.hammer ?? 0),
    premium: Number(row.buyers_premium ?? row.premium ?? 0),
    handling: Number(row.handling_fee ?? row.handling ?? 0),
    gst: Number(row.gst ?? 0),
    shippingCost: Number(row.shipping_cost ?? 0),
    payment: asPayment(row.payment_status),
    shipping: asShipping(row.shipping_status),
    notes: String(row.notes ?? ""),
    fulfillment:
      row.fulfillment === "ship" || row.fulfillment === "pickup" ? row.fulfillment : "unset",
  };
}

export function mapArchiveRow(row: Record<string, unknown>): SettlementArchiveRecord {
  return {
    eventId: String(row.event_id ?? ""),
    auctionNumber: String(row.auction_number ?? ""),
    name: String(row.name ?? ""),
    savedAt: String(row.saved_at ?? new Date().toISOString()),
    snapshot: (row.snapshot as SettlementArchiveRecord["snapshot"]) ?? {
      eventId: String(row.event_id ?? ""),
      name: String(row.name ?? ""),
      auctionNumber: String(row.auction_number ?? ""),
      startsAt: "",
      endsAt: "",
      invoices: [],
      unsold: [],
    },
  };
}

export async function listSettlementInvoices(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("settlement_invoices")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapInvoiceRow(row as Record<string, unknown>));
}

export async function listSettlementArchives(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("settlement_archives")
    .select("*")
    .order("saved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapArchiveRow(row as Record<string, unknown>));
}

export async function upsertSettlementInvoice(
  supabase: SupabaseClient,
  row: SettlementInvoiceRecord,
) {
  const payload = {
    event_id: row.eventId,
    invoice_number: row.invoice,
    buyer_key: row.buyerKey,
    buyer_name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    payment_method: row.paymentMethod,
    payment_status: row.payment ?? emptyMark().payment,
    shipping_status: row.shipping ?? emptyMark().shipping,
    notes: row.notes ?? "",
    total: row.total,
    lots: row.lots,
    fulfillment: row.fulfillment ?? "unset",
    hammer: row.hammer ?? 0,
    buyers_premium: row.premium ?? 0,
    gst: row.gst ?? 0,
    handling_fee: row.handling ?? 0,
    shipping_cost: row.shippingCost ?? 0,
  };
  const { error } = await supabase.from("settlement_invoices").upsert(payload, {
    onConflict: "invoice_number",
  });
  if (error && /buyers_premium|handling_fee|shipping_cost|\bhammer\b|\bgst\b/i.test(error.message)) {
    const { hammer: _h, buyers_premium: _p, gst: _g, handling_fee: _hf, shipping_cost: _sc, ...withoutFees } =
      payload;
    const retry = await supabase.from("settlement_invoices").upsert(withoutFees, {
      onConflict: "invoice_number",
    });
    if (retry.error && /fulfillment/i.test(retry.error.message)) {
      const { fulfillment: _f, ...rest } = withoutFees;
      const last = await supabase.from("settlement_invoices").upsert(rest, { onConflict: "invoice_number" });
      if (last.error) throw last.error;
      return;
    }
    if (retry.error) throw retry.error;
    return;
  }
  if (error && /fulfillment/i.test(error.message)) {
    const { fulfillment: _f, ...rest } = payload;
    const retry = await supabase.from("settlement_invoices").upsert(rest, {
      onConflict: "invoice_number",
    });
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
}

export async function upsertSettlementArchive(
  supabase: SupabaseClient,
  row: SettlementArchiveRecord,
) {
  const { error } = await supabase.from("settlement_archives").upsert(
    {
      event_id: row.eventId,
      auction_number: row.auctionNumber,
      name: row.name,
      snapshot: row.snapshot,
      saved_at: row.savedAt,
    },
    { onConflict: "event_id" },
  );
  if (error) throw error;
}
