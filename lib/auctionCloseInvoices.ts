import { settleEndedAuctions } from "@/lib/closeEndedLots";
import { mapLot, type LotRow } from "@/lib/mappers";
import { saleSettlesInCash, stampInvoiceEmailed } from "@/lib/invoiceMail";
import { sendWinInvoiceEmail } from "@/lib/notify";
import { invoiceFees } from "@/lib/invoiceFees";
import { settlementInvoice } from "@/lib/payments";
import { emptyMark, type SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { mapInvoiceRow, upsertSettlementInvoice } from "@/lib/settlementDb";
import { invoiceFulfillment, settlementLotFrom } from "@/lib/settlements";
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
  await settleEndedAuctions();
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
    const seenLotIds = new Set<string>();
    const sold = (soldRows ?? [])
      .map((row) => mapLot(row as LotRow))
      .filter((lot) => {
        if (!lot.highBidderId && !lot.highBidder) return false;
        // Buy Now already billed the buyer the moment they claimed it.
        if (lot.saleSource === "buy_now" || lot.buyNowStatus === "sold") return false;
        if (seenLotIds.has(lot.id)) return false;
        seenLotIds.add(lot.id);
        return true;
      });
    const bidderIds = Array.from(
      new Set(sold.map((lot) => lot.highBidderId).filter((id): id is string => Boolean(id))),
    );
    const { data: profileRows } = bidderIds.length
      ? await supabase.from("profiles").select("*").in("id", bidderIds)
      : { data: [] as Array<Record<string, unknown>> };
    const profiles = new Map((profileRows ?? []).map((row) => [String(row.id), row]));
    const byBuyer = new Map<
      string,
      { lots: typeof sold; profile: Record<string, unknown> | null; name: string }
    >();
    for (const lot of sold) {
      const profile = lot.highBidderId ? profiles.get(lot.highBidderId) ?? null : null;
      const email = String(profile?.email ?? "").trim().toLowerCase();
      const key = email || lot.highBidderId || (lot.highBidder || "floor").trim().toLowerCase();
      const current = byBuyer.get(key);
      if (current) {
        current.lots.push(lot);
        if (!current.profile && profile) current.profile = profile;
      } else {
        byBuyer.set(key, {
          lots: [lot],
          profile,
          name: String(profile?.full_name ?? lot.highBidder ?? "Bidder"),
        });
      }
    }
    for (const [buyerKey, group] of Array.from(byBuyer.entries())) {
      const lots = [...group.lots].sort((a, b) =>
        String(a.lotNumber ?? "").localeCompare(String(b.lotNumber ?? ""), undefined, { numeric: true }),
      );
      const first = lots[0];
      const profile = group.profile;
      const email = String(profile?.email ?? "");
      const name = group.name;
      const stableBuyer = first.highBidderId || String(buyerKey);
      const invoice = settlementInvoice(event.auction_number ?? first.auctionNumber, stableBuyer);
      const lines = lots.map((lot) => settlementLotFrom(lot));
      const fulfillment = invoiceFulfillment(lines);
      const shippingCost = lots.reduce((sum, lot) => sum + Number(lot.shippingCost ?? 0), 0);
      const fees = invoiceFees({
        hammer: lots.reduce((sum, lot) => sum + lot.currentBid, 0),
        fulfillment,
        shippingCost,
      });
      const { data: priorRow } = await supabase
        .from("settlement_invoices")
        .select("*")
        .eq("invoice_number", invoice)
        .maybeSingle();
      const prior = priorRow ? mapInvoiceRow(priorRow as Record<string, unknown>) : null;
      const record: SettlementInvoiceRecord = {
        ...emptyMark(),
        ...prior,
        invoice,
        eventId,
        buyerKey: stableBuyer,
        name,
        email,
        phone: String(profile?.phone ?? prior?.phone ?? ""),
        address: addressOf((profile as Record<string, unknown> | null) ?? null) || prior?.address || "",
        paymentMethod: String(profile?.payment_method ?? prior?.paymentMethod ?? "helcim_card"),
        lots: lines,
        total: fees.total,
        hammer: fees.hammer,
        premium: fees.premium,
        handling: fees.handling,
        gst: fees.gst,
        shippingCost: prior?.shippingCost || fees.shipping,
        fulfillment,
        payment: prior?.payment ?? "unpaid",
        shipping: prior?.shipping ?? "pending",
        notes: prior?.notes ?? "",
      };
      await upsertSettlementInvoice(supabase, record);
      const { data: existing } = await supabase
        .from("settlement_invoices")
        .select("batch_invoice_sent_at")
        .eq("invoice_number", invoice)
        .maybeSingle();
      const cashSale =
        prior?.paymentChannel === "cash" ||
        prior?.payment === "cash_pending" ||
        (await saleSettlesInCash(first.highBidderId, eventId));
      if (!existing?.batch_invoice_sent_at && email && !cashSale) {
        const mailLines = lines.map((lot) => ({
          title: lot.title,
          lotNumber: lot.lotNumber ?? null,
          hammer: lot.hammer,
        }));
        await sendWinInvoiceEmail({
          to: email,
          name,
          title: mailLines.length === 1 ? mailLines[0].title : `${mailLines.length} lots`,
          invoice,
          lotId: mailLines.length === 1 ? first.id : "",
          slug: mailLines.length === 1 ? first.slug : null,
          fees,
          fulfillment,
          address: record.address,
          batch: true,
          lots: mailLines,
        });
        await stampInvoiceEmailed(invoice);
        invoiced += 1;
      }
      const winnerIds = Array.from(
        new Set(lots.map((lot) => lot.highBidderId).filter((id): id is string => Boolean(id))),
      );
      if (winnerIds.length) {
        await supabase
          .from("pending_invoice_items")
          .update({ invoiced_at: new Date().toISOString() })
          .eq("event_id", eventId)
          .in("user_id", winnerIds);
      }
    }
    await supabase
      .from("auction_events")
      .update({ invoice_batch_sent_at: new Date().toISOString() })
      .eq("id", eventId);
  }
  return { invoiced, events: events?.length ?? 0 };
}
