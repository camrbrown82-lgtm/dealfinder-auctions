import { NextRequest, NextResponse } from "next/server";
import { bidderSettlesInCash } from "@/lib/auctionRegistrations";
import { getBidderSession } from "@/lib/bidderAuth";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { mapLot, type LotRow } from "@/lib/mappers";
import { invoiceFees } from "@/lib/invoiceFees";
import {
  invoiceNumber,
  isFulfillmentChoice,
  paymentInstructions,
  paymentMethodLabel,
  type FulfillmentChoice,
} from "@/lib/payments";
import { profileAddress } from "@/lib/profileTypes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { MOCK_LOTS, type AuctionLot } from "@/lib/utils";
import { settleEndedAuctions } from "@/lib/closeEndedLots";
import { demoOwnsLot, fetchOwnedLotRows, sessionOwnsLot } from "@/lib/winOwnership";
import { saveWinFulfillment } from "@/lib/winFulfillment";
import { invoicePaymentForLot, requestCashPayment } from "@/lib/cashPayment";
import { estimateCarrierShipping } from "@/lib/shippingEstimate";
import type { WinInvoice } from "@/lib/winTypes";
import { invoiceReadyForEvent } from "@/lib/auctionCloseInvoices";
import { receiptPageUrl } from "@/lib/receiptToken";
import { invoiceReadyForSale } from "@/lib/saleChannel";
import { isLotPaid, lotPaidRecord } from "@/lib/helcim";

export const dynamic = "force-dynamic";

/** A settled purchase: bought outright, already paid, or the hammer fell with
 *  this paddle on top. A lot still taking bids is not a purchase, and a lot the
 *  paddle bid on and lost is never one. */
function isBoughtLot(lot: AuctionLot) {
  if (lot.paidAt || isLotPaid(lot)) return true;
  if (lot.saleSource === "buy_now" || lot.buyNowStatus === "sold") return true;
  return lot.status === "ended";
}

export async function GET() {
  const session = await getBidderSession();
  if (!session) return NextResponse.json({ wins: [] as WinInvoice[] });

  let lots: AuctionLot[] = [];

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      // Flip lots whose clock has run out so a fresh win is payable right away
      // instead of waiting on the close cron.
      await settleEndedAuctions().catch(() => undefined);
      const rows = await fetchOwnedLotRows(supabase, session);
      lots = rows.map(mapLot);
    }
  } else {
    lots = MOCK_LOTS.map((lot) => {
      const demo = getDemoLot(lot.id);
      if (!demo) return lot;
      return {
        ...lot,
        currentBid: demo.currentBid,
        endsAt: demo.endsAt,
        highBidder: demo.highBidder,
        highBidderId: demo.highBidderId,
        status: (demo.status as AuctionLot["status"]) ?? lot.status,
        fulfillment: demo.fulfillment ?? lot.fulfillment ?? "unset",
        shippingCost: demo.shippingCost ?? lot.shippingCost ?? 0,
        paidAt: demo.paidAt ?? lot.paidAt ?? null,
        helcimPurchaseTransactionId:
          demo.helcimPurchaseTransactionId ?? lot.helcimPurchaseTransactionId ?? null,
      };
    }).filter((lot) => demoOwnsLot(session, lot));
  }

  const address = profileAddress(session);
  const handlingClaimed = new Set<string>();
  const wins: WinInvoice[] = [];
  for (const lot of lots) {
    if (!isBoughtLot(lot)) continue;
    const invoice = invoiceNumber(lot.id, session.id);
    const memory = lotPaidRecord(lot.id);
    const paid = isLotPaid(lot) || Boolean(memory);
    const groupKey = lot.eventId || "house";
    const includeHandling = lot.fulfillment === "ship" && !handlingClaimed.has(groupKey);
    if (includeHandling) handlingClaimed.add(groupKey);
    const fees = invoiceFees({
      hammer: lot.currentBid,
      fulfillment: lot.fulfillment ?? "unset",
      shippingCost: lot.shippingCost ?? 0,
      includeHandling,
    });
    const settlement = await invoicePaymentForLot(lot.id, session);
    const invoiceReady =
      invoiceReadyForSale(lot) || (await invoiceReadyForEvent(lot.eventId));
    wins.push({
      lotId: lot.id,
      title: lot.title,
      slug: lot.slug,
      currentBid: fees.hammer,
      premium: fees.premium,
      handling: fees.handling,
      shippingCost: fees.shipping,
      gst: fees.gst,
      total: fees.total,
      status: lot.status,
      invoice: settlement?.invoice ?? invoice,
      paymentMethodKey: "helcim_card" as const,
      paymentMethod: paymentMethodLabel("helcim_card"),
      instructions: paymentInstructions("helcim_card", settlement?.invoice ?? invoice),
      winning: lot.status === "ended",
      fulfillment: lot.fulfillment ?? "unset",
      address,
      buyerName: session.fullName,
      phone: session.phone,
      paid: paid || settlement?.payment === "paid",
      paidAt: lot.paidAt ?? memory?.paidAt ?? null,
      payment: settlement?.payment ?? (paid ? "paid" : "unpaid"),
      paymentChannel: settlement?.paymentChannel ?? "helcim",
      invoiceReady,
      lotNumber: lot.lotNumber ?? null,
      image: lot.image || null,
      receiptUrl: settlement?.invoice ? receiptPageUrl(settlement.invoice, true) : null,
    });
  }

  return NextResponse.json({ wins, profile: session });
}

export async function PATCH(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to choose shipping." }, { status: 401 });
  }
  const body = (await request.json()) as {
    lotId?: string;
    fulfillment?: FulfillmentChoice;
    cash?: boolean;
    address?: {
      fullName?: string;
      street?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      phone?: string;
    };
  };
  if (!body.lotId) {
    return NextResponse.json({ error: "lotId is required." }, { status: 400 });
  }

  let lot: AuctionLot | null = null;
  let owns = false;
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from("lots").select("*").eq("id", body.lotId).maybeSingle();
      lot = data ? mapLot(data as LotRow) : null;
      if (lot) owns = await sessionOwnsLot(supabase, session, lot);
    }
  } else {
    const demo = getDemoLot(body.lotId);
    const mock = MOCK_LOTS.find((row) => row.id === body.lotId);
    if (mock) {
      lot = {
        ...mock,
        highBidder: demo?.highBidder ?? mock.highBidder ?? null,
        highBidderId: demo?.highBidderId ?? mock.highBidderId ?? null,
        status: (demo?.status as AuctionLot["status"]) ?? mock.status,
        fulfillment: demo?.fulfillment,
      };
    }
    if (lot) owns = demoOwnsLot(session, lot);
  }

  if (!lot) return NextResponse.json({ error: "Lot not found." }, { status: 404 });
  if (!owns) {
    return NextResponse.json({ error: "Only the winner can update this invoice." }, { status: 403 });
  }
  if (lot.status !== "ended") {
    return NextResponse.json({ error: "Choose shipping after the hammer." }, { status: 400 });
  }

  if (body.cash) {
    try {
      if (!invoiceReadyForSale(lot) && !(await invoiceReadyForEvent(lot.eventId))) {
        return NextResponse.json(
          { error: "Cash pickup and Helcim pay open after Sunday's consolidated invoice is sent." },
          { status: 400 },
        );
      }
      if (lot.fulfillment !== "pickup") {
        await saveWinFulfillment(body.lotId, "pickup", session);
      }
      const { row, cashApproved } = await requestCashPayment(body.lotId, session);
      return NextResponse.json({
        ok: true,
        payment: row.payment,
        invoice: row.invoice,
        cashApproved,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not request cash payment.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (!body.fulfillment || !isFulfillmentChoice(body.fulfillment) || body.fulfillment === "unset") {
    return NextResponse.json({ error: "Pick ship or pick up for a won lot." }, { status: 400 });
  }

  let addressLine = profileAddress(session);
  if (body.address) {
    const next = {
      ...session,
      fullName: body.address.fullName?.trim() || session.fullName,
      phone: body.address.phone?.trim() || session.phone,
      street: body.address.street?.trim() || session.street,
      city: body.address.city?.trim() || session.city,
      province: body.address.province?.trim() || session.province,
      postalCode: body.address.postalCode?.trim() || session.postalCode,
    };
    addressLine = profileAddress(next);
    const supabase = getSupabaseAdmin();
    if (isSupabaseConfigured && supabase) {
      await supabase
        .from("profiles")
        .update({
          full_name: next.fullName,
          phone: next.phone,
          street: next.street,
          city: next.city,
          province: next.province,
          postal_code: next.postalCode,
        })
        .eq("id", session.id);
    }
  }

  const shippingCost =
    body.fulfillment === "ship"
      ? estimateCarrierShipping({
          province: body.address?.province || session.province,
          postalCode: body.address?.postalCode || session.postalCode,
        })
      : 0;

  try {
    await saveWinFulfillment(body.lotId, body.fulfillment, session, {
      shippingCost,
      address: addressLine,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save delivery choice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // A trusted cash paddle choosing pickup is settled here: cash at the counter,
  // no Helcim prompt and no desk approval.
  let cashApproved = false;
  if (body.fulfillment === "pickup" && (await bidderSettlesInCash(session.id))) {
    const ready = invoiceReadyForSale(lot) || (await invoiceReadyForEvent(lot.eventId));
    if (ready) {
      try {
        const settled = await requestCashPayment(body.lotId, session);
        cashApproved = settled.cashApproved;
      } catch {
        /* leave the invoice payable online */
      }
    }
  }

  return NextResponse.json({ ok: true, fulfillment: body.fulfillment, shippingCost, cashApproved });
}
