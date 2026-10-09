import { getAuctionRegistration, isTrustedCashUser } from "@/lib/auctionRegistrations";
import { invoiceFees } from "@/lib/invoiceFees";
import { sendOrderShippedEmail, sendWinInvoiceEmail } from "@/lib/notify";
import { mapInvoiceRow } from "@/lib/settlementDb";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

const SHIPPED_MARK = "[shipped-email]";

/** Cash-on-pickup permission for this sale. A Helcim paddle on the same auction still gets the online invoice. */
export async function saleSettlesInCash(userId: string | null | undefined, eventId: string | null | undefined) {
  const id = String(userId ?? "").trim();
  if (!id) return false;
  if (eventId) {
    const registration = await getAuctionRegistration(id, eventId);
    if (registration?.paymentMethod === "helcim") return false;
    if (registration?.paymentMethod === "cash" && registration.authStatus === "approved") return true;
  }
  return isTrustedCashUser(id);
}

async function sentFlags(invoice: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return { invoiceSent: false, shippedSent: false, notes: "" };
  }
  const { data } = await supabase
    .from("settlement_invoices")
    .select("batch_invoice_sent_at, win_email_sent_at, notes")
    .eq("invoice_number", invoice)
    .maybeSingle();
  const notes = String(data?.notes ?? "");
  return {
    invoiceSent: Boolean(data?.batch_invoice_sent_at || data?.win_email_sent_at),
    shippedSent: notes.includes(SHIPPED_MARK),
    notes,
  };
}

export async function stampInvoiceEmailed(invoice: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase || !invoice) return;
  const now = new Date().toISOString();
  await supabase
    .from("settlement_invoices")
    .update({ batch_invoice_sent_at: now, win_email_sent_at: now })
    .eq("invoice_number", invoice);
}

async function loadInvoice(invoice: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase
    .from("settlement_invoices")
    .select("*")
    .eq("invoice_number", invoice)
    .maybeSingle();
  return data ? mapInvoiceRow(data as Record<string, unknown>) : null;
}

function feeSnapshot(row: SettlementInvoiceRecord) {
  const computed = invoiceFees({
    hammer: row.lots.reduce((sum, lot) => sum + Number(lot.hammer ?? 0), 0),
    fulfillment: row.fulfillment === "ship" ? "ship" : "pickup",
    shippingCost: row.shippingCost ?? 0,
  });
  return {
    ...computed,
    hammer: row.hammer || computed.hammer,
    premium: row.premium || computed.premium,
    shipping: row.shippingCost || computed.shipping,
    handling: row.handling || computed.handling,
    gst: row.gst || computed.gst,
    total: row.total || computed.total,
  };
}

/** One invoice email. Later calls for the same invoice do nothing. */
export async function sendInvoiceOnce(
  row: SettlementInvoiceRecord,
  subject = "Your DealFinder invoice",
) {
  if (!row.email || !row.invoice) return false;
  const flags = await sentFlags(row.invoice);
  if (flags.invoiceSent) return false;
  const titles = row.lots.map((lot) => lot.title).filter(Boolean);
  const first = row.lots[0];
  await sendWinInvoiceEmail({
    to: row.email,
    name: row.name,
    title: titles.join(", ") || "Your lots",
    invoice: row.invoice,
    lotId: first?.id ?? row.invoice,
    address: row.address,
    fulfillment: row.fulfillment === "ship" ? "ship" : "pickup",
    lots: row.lots.map((lot) => ({
      title: lot.title,
      lotNumber: lot.lotNumber,
      hammer: lot.hammer,
    })),
    fees: feeSnapshot(row),
    batch: row.lots.length > 1,
    subjectOverride: subject,
  });
  await stampInvoiceEmailed(row.invoice);
  return true;
}

export async function sendInvoiceOnceByNumber(invoice: string, subject?: string) {
  const row = await loadInvoice(invoice);
  if (!row) return false;
  return sendInvoiceOnce(row, subject);
}

/** Cash permission: the invoice waits until the desk marks the lots picked up. */
export async function sendCashPickupInvoice(row: SettlementInvoiceRecord) {
  const cash =
    row.paymentChannel === "cash" ||
    row.payment === "cash_pending" ||
    (await saleSettlesInCash(row.buyerKey, row.eventId));
  if (!cash) return false;
  return sendInvoiceOnce(row, "Your DealFinder invoice — pickup");
}

/** Card payment just cleared. Cash buyers who pay online get this once; everyone else already has it. */
export async function sendOnlinePaymentInvoice(invoice: string) {
  return sendInvoiceOnceByNumber(invoice, "Your DealFinder invoice");
}

export async function sendShippedNotice(row: SettlementInvoiceRecord) {
  if (!row.email || !row.invoice) return false;
  const flags = await sentFlags(row.invoice);
  if (flags.shippedSent) return false;
  await sendOrderShippedEmail({
    to: row.email,
    name: row.name,
    invoice: row.invoice,
    postage: Number(row.shippingCost ?? 0),
    tracking: row.trackingNumber ?? "",
    lots: row.lots.map((lot) => lot.title).filter(Boolean),
  });
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const notes = [flags.notes.replaceAll(SHIPPED_MARK, "").trim(), SHIPPED_MARK].filter(Boolean).join("\n");
    await supabase.from("settlement_invoices").update({ notes }).eq("invoice_number", row.invoice);
  }
  return true;
}
