import { demoSettlementInvoices, upsertDemoInvoice } from "@/lib/demoSettlementStore";
import { markDemoLotPaid } from "@/lib/demoAuctionStore";
import { invoiceFees } from "@/lib/invoiceFees";
import { sendCashReceiptEmail } from "@/lib/notify";
import { mapInvoiceRow, upsertSettlementInvoice } from "@/lib/settlementDb";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { BidderProfile } from "@/lib/profileTypes";

function invoiceHasLot(lots: unknown, lotId: string) {
  if (!Array.isArray(lots)) return false;
  return lots.some((item) => String((item as { id?: string }).id ?? "") === lotId);
}

async function findInvoiceForLot(lotId: string, session: BidderProfile) {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const keys = [session.id, session.email, session.fullName].filter(Boolean);
    const { data } = await supabase.from("settlement_invoices").select("*").in("buyer_key", keys);
    const match = (data ?? []).find((row) => invoiceHasLot(row.lots, lotId));
    return match ? mapInvoiceRow(match as Record<string, unknown>) : null;
  }
  return (
    demoSettlementInvoices().find(
      (row) =>
        invoiceHasLot(row.lots, lotId) &&
        [session.id, session.email, session.fullName].includes(row.buyerKey),
    ) ?? null
  );
}

async function persist(row: SettlementInvoiceRecord) {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    await upsertSettlementInvoice(supabase, row);
    return;
  }
  upsertDemoInvoice(row);
}

export async function requestCashPayment(lotId: string, session: BidderProfile) {
  const row = await findInvoiceForLot(lotId, session);
  if (!row) throw new Error("Invoice not found yet. Wait for the hammer to close.");
  if (row.payment === "paid") throw new Error("This invoice is already paid.");
  row.fulfillment = "pickup";
  row.shippingCost = 0;
  row.payment = "cash_pending";
  row.paymentChannel = "cash";
  row.notes = [row.notes, "Cash payment requested on pickup."].filter(Boolean).join(" ");
  const fees = invoiceFees({
    hammer: row.lots.reduce((sum, lot) => sum + Number(lot.hammer ?? 0), 0),
    fulfillment: "pickup",
    shippingCost: 0,
  });
  row.hammer = fees.hammer;
  row.premium = fees.premium;
  row.handling = fees.handling;
  row.gst = fees.gst;
  row.total = fees.total;
  await persist(row);
  return row;
}

export async function resolveCashRequest(invoice: string, approve: boolean) {
  const supabase = getSupabaseAdmin();
  let row: SettlementInvoiceRecord | null = null;
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from("settlement_invoices")
      .select("*")
      .eq("invoice_number", invoice)
      .maybeSingle();
    row = data ? mapInvoiceRow(data as Record<string, unknown>) : null;
  } else {
    row = demoSettlementInvoices().find((item) => item.invoice === invoice) ?? null;
  }
  if (!row) throw new Error("Invoice not found.");
  if (row.payment !== "cash_pending" && !approve) {
    throw new Error("No cash request is waiting on this invoice.");
  }

  if (approve) {
    row.payment = "paid";
    row.paymentChannel = "cash";
    row.fulfillment = "pickup";
    row.shipping = "picked_up";
    row.notes = [row.notes, "Paid in cash."].filter(Boolean).join(" ");
    await persist(row);
    for (const lot of row.lots) {
      markDemoLotPaid(lot.id, `cash-${invoice}`);
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from("lots")
          .update({ paid_at: new Date().toISOString() })
          .eq("id", lot.id);
      }
    }
    if (row.email) {
      void sendCashReceiptEmail({
        to: row.email,
        name: row.name,
        title: row.lots.map((lot) => lot.title).join(", "),
        invoice: row.invoice,
        total: row.total,
      });
    }
    return row;
  }

  row.payment = "unpaid";
  row.paymentChannel = "helcim";
  row.notes = [row.notes, "Cash request rejected — pay with Helcim."].filter(Boolean).join(" ");
  await persist(row);
  return row;
}

export async function invoicePaymentForLot(lotId: string, session: BidderProfile) {
  const row = await findInvoiceForLot(lotId, session);
  return row
    ? { payment: row.payment, paymentChannel: row.paymentChannel ?? "helcim", invoice: row.invoice }
    : null;
}
