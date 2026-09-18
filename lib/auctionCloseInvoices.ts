import { closeEndedSoldLots } from "@/lib/closeEndedLots";
import { mapLot, type LotRow } from "@/lib/mappers";
import { sendWinInvoiceEmail } from "@/lib/notify";
import { invoiceFees } from "@/lib/invoiceFees";
import { settlementInvoice } from "@/lib/payments";
import { emptyMark, type SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { upsertSettlementInvoice } from "@/lib/settlementDb";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export async function invoiceReadyForEvent(eventId: string | null | undefined) {
  if (!eventId) return false;
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return false;
  const { data } = await supabase
    .from("auction_events")
    .select("invoice_batch_sent_at")
    .eq("id", eventId)
    .maybeSingle();
  return Boolean(data?.invoice_batch_sent_at);
}

function addressOf(row: Record<string, unknown> | null) {
  if (!row) return "No shipping profile on file";
  const line = [row.street, row.city, row.province, row.postal_code].filter(Boolean).join(", ");
  return String(line || "No shipping profile on file");
}

export async function issueEndedAuctionInvoices() {
  await closeEndedSoldLots();
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { invoiced: 0, events: 0 };
  const now = new Date().toISOString();
  const { data: events } = await supabase
    .from("auction_events")
    .select("*")
    .or(`ends_at.lte.${now},archived_at.not.is.null`)
    .is("invoice_batch_sent_at", null);
  let invoiced = 0;
  for (const event of events ?? []) {
    const eventId = String(event.id);
    const { data: live } = await supabase.from("lots").select("*").eq("event_id", eventId).eq("status", "live");
    for (const row of live ?? []) {
      await supabase.from("lots").update({ status: "ended" }).eq("id", row.id);
    }
    const { data: soldRows } = await supabase
      .from("lots")
      .select("*")
      .eq("event_id", eventId)
      .eq("status", "ended");
    const sold = (soldRows ?? [])
      .map((row) => mapLot(row as LotRow))
      .filter((lot) => Boolean(lot.highBidderId || lot.highBidder));
    const byBuyer = new Map<string, typeof sold>();
    for (const lot of sold) {
      const key = lot.highBidderId || lot.highBidder || "floor";
      const list = byBuyer.get(key) ?? [];
      list.push(lot);
      byBuyer.set(key, list);
    }
    for (const [buyerKey, lots] of Array.from(byBuyer.entries())) {
      const first = lots[0];
      const profile = first.highBidderId
        ? (await supabase.from("profiles").select("*").eq("id", first.highBidderId).maybeSingle()).data
        : null;
      const email = String(profile?.email ?? "");
      const name = String(profile?.full_name ?? first.highBidder ?? "Bidder");
      const invoice = settlementInvoice(event.auction_number ?? first.auctionNumber, String(buyerKey));
      const fulfillment = lots.some((lot) => lot.fulfillment === "ship")
        ? "ship"
        : lots.length > 0 && lots.every((lot) => lot.fulfillment === "pickup")
          ? "pickup"
          : "unset";
      const shippingCost = lots.reduce((sum, lot) => sum + Number(lot.shippingCost ?? 0), 0);
      const fees = invoiceFees({
        hammer: lots.reduce((sum, lot) => sum + lot.currentBid, 0),
        fulfillment,
        shippingCost,
      });
      const record: SettlementInvoiceRecord = {
        invoice,
        eventId,
        buyerKey: String(buyerKey),
        name,
        email,
        phone: String(profile?.phone ?? ""),
        address: addressOf((profile as Record<string, unknown> | null) ?? null),
        paymentMethod: String(profile?.payment_method ?? "helcim_card"),
        lots: lots.map((lot) => ({
          id: lot.id,
          title: lot.title,
          lotNumber: lot.lotNumber ?? null,
          hammer: lot.currentBid,
        })),
        total: fees.total,
        hammer: fees.hammer,
        premium: fees.premium,
        handling: fees.handling,
        gst: fees.gst,
        shippingCost: fees.shipping,
        fulfillment,
        ...emptyMark(),
        payment: "unpaid",
      };
      await upsertSettlementInvoice(supabase, record);
      const { data: existing } = await supabase
        .from("settlement_invoices")
        .select("batch_invoice_sent_at")
        .eq("invoice_number", invoice)
        .maybeSingle();
      if (!existing?.batch_invoice_sent_at && email) {
        await sendWinInvoiceEmail({
          to: email,
          name,
          title: lots.map((lot) => lot.title).join(", "),
          invoice,
          lotId: first.id,
          slug: first.slug,
          fees,
          fulfillment,
          address: record.address,
          batch: true,
        });
        await supabase
          .from("settlement_invoices")
          .update({
            batch_invoice_sent_at: new Date().toISOString(),
            win_email_sent_at: new Date().toISOString(),
          })
          .eq("invoice_number", invoice);
        invoiced += 1;
      }
      if (first.highBidderId) {
        await supabase
          .from("pending_invoice_items")
          .update({ invoiced_at: new Date().toISOString() })
          .eq("event_id", eventId)
          .eq("user_id", first.highBidderId);
      }
    }
    await supabase
      .from("auction_events")
      .update({ invoice_batch_sent_at: new Date().toISOString() })
      .eq("id", eventId);
  }
  return { invoiced, events: events?.length ?? 0 };
}
