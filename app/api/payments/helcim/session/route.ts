import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import { invoiceFees } from "@/lib/invoiceFees";
import { isPaymentTestMode } from "@/lib/paymentMode";
import { invoiceNumber } from "@/lib/payments";
import {
  helcimCurrency,
  initializeHelcimCheckout,
  isHelcimConfigured,
  loadBidderPayment,
  preauthAmount,
  saveHelcimSession,
  type HelcimPurpose,
} from "@/lib/helcim";
import { PREAUTH_DISCLAIMER, PREAUTH_DISCLAIMER_TITLE } from "@/lib/helcimCopy";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { MOCK_LOTS } from "@/lib/utils";

export const dynamic = "force-dynamic";

function isPurpose(value: unknown): value is HelcimPurpose {
  return value === "bid_preauth" || value === "checkout_purchase";
}

async function hammerForLot(lotId: string, bidderId: string, bidderName: string) {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from("lots").select("*").eq("id", lotId).maybeSingle();
      if (data) {
        const owns =
          data.high_bidder_id === bidderId ||
          data.high_bidder === bidderName;
        if (!owns) return { error: "Only the winning paddle can pay this invoice." };
        if (data.paid_at) return { error: "This invoice is already paid." };
        const fulfillment = data.fulfillment === "ship" || data.fulfillment === "pickup" ? data.fulfillment : "unset";
        if (fulfillment === "unset") {
          return { error: "Choose local pickup or shipping before paying this invoice." };
        }
        const { invoiceReadyForSale } = await import("@/lib/saleChannel");
        if (!invoiceReadyForSale({ sale_channel: data.sale_channel, sale_source: data.sale_source })) {
          const { invoiceReadyForEvent } = await import("@/lib/auctionCloseInvoices");
          if (!(await invoiceReadyForEvent(data.event_id ? String(data.event_id) : null))) {
            return { error: "Helcim checkout opens after Sunday's consolidated invoice is emailed." };
          }
        }
        let includeHandling = fulfillment === "ship";
        if (includeHandling && data.event_id && data.high_bidder_id) {
          const siblings = await supabase
            .from("lots")
            .select("id, paid_at, fulfillment")
            .eq("event_id", data.event_id)
            .eq("high_bidder_id", data.high_bidder_id);
          includeHandling = !(siblings.data ?? []).some(
            (row) => row.id !== data.id && row.fulfillment === "ship" && row.paid_at,
          );
        }
        const fees = invoiceFees({
          hammer: Number(data.current_bid),
          fulfillment,
          shippingCost: Number(data.shipping_cost ?? 0),
          includeHandling,
        });
        return { amount: fees.total, title: String(data.title ?? "Lot") };
      }
    }
  }
  const demo = getDemoLot(lotId);
  if (demo?.paidAt) return { error: "This invoice is already paid." };
  const fallback = demo || MOCK_LOTS.find((row) => row.id === lotId);
  if (!fallback) return { error: "Lot not found." };
  const fulfillment =
    ("fulfillment" in fallback && (fallback.fulfillment === "ship" || fallback.fulfillment === "pickup")
      ? fallback.fulfillment
      : demo?.fulfillment === "ship" || demo?.fulfillment === "pickup"
        ? demo.fulfillment
        : "unset");
  const fees = invoiceFees({
    hammer: Number(fallback.currentBid),
    fulfillment,
    shippingCost: "shippingCost" in fallback ? Number(fallback.shippingCost ?? 0) : Number(demo?.shippingCost ?? 0),
  });
  if (fulfillment === "unset") {
    return { error: "Choose local pickup or shipping before paying this invoice." };
  }
  return { amount: fees.total, title: "Lot" };
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();

  const body = (await request.json()) as { purpose?: string; lotId?: string; eventId?: string };
  if (!isPurpose(body.purpose)) {
    return NextResponse.json({ error: "Unknown Helcim checkout purpose." }, { status: 400 });
  }

  const payment = await loadBidderPayment(session.id);
  const currency = helcimCurrency();
  let amount = preauthAmount();
  let invoice = `DF-HOLD-${session.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
  let lotId: string | null = body.lotId?.trim() || null;
  const eventId = body.eventId?.trim() || null;

  if (body.purpose === "bid_preauth") {
    if (payment.preauthStatus === "held") {
      return NextResponse.json({
        alreadyHeld: true,
        amount: payment.preauthAmount,
        currency,
        disclaimer: PREAUTH_DISCLAIMER,
        disclaimerTitle: PREAUTH_DISCLAIMER_TITLE,
      });
    }
  } else {
    if (!lotId) {
      return NextResponse.json({ error: "lotId is required to pay an invoice." }, { status: 400 });
    }
    const hammer = await hammerForLot(lotId, session.id, session.fullName);
    if ("error" in hammer) {
      return NextResponse.json({ error: hammer.error }, { status: 400 });
    }
    amount = Number(hammer.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Nothing to charge on this invoice." }, { status: 400 });
    }
    invoice = invoiceNumber(lotId, session.id);
  }

  const createdAt = new Date().toISOString();

  if (!isHelcimConfigured()) {
    const checkoutToken = `demo-${crypto.randomUUID()}`;
    await saveHelcimSession({
      checkoutToken,
      secretToken: "demo",
      bidderId: session.id,
      purpose: body.purpose,
      lotId,
      eventId,
      amount,
      currency,
      invoiceNumber: invoice,
      demo: true,
      createdAt,
    });
    return NextResponse.json({
      demo: true,
      testMode: isPaymentTestMode(),
      configured: false,
      checkoutToken,
      amount,
      currency,
      invoice,
      purpose: body.purpose,
      disclaimer: PREAUTH_DISCLAIMER,
      disclaimerTitle: PREAUTH_DISCLAIMER_TITLE,
    });
  }

  try {
    const tokens = await initializeHelcimCheckout({
      paymentType: body.purpose === "bid_preauth" ? "preauth" : "purchase",
      amount,
      currency,
      invoiceNumber: invoice,
      customerCode: payment.helcimCustomerCode,
    });
    await saveHelcimSession({
      checkoutToken: tokens.checkoutToken,
      secretToken: tokens.secretToken,
      bidderId: session.id,
      purpose: body.purpose,
      lotId,
      eventId,
      amount,
      currency,
      invoiceNumber: invoice,
      demo: false,
      createdAt,
    });
    return NextResponse.json({
      demo: false,
      testMode: isPaymentTestMode(),
      configured: true,
      checkoutToken: tokens.checkoutToken,
      amount,
      currency,
      invoice,
      purpose: body.purpose,
      disclaimer: PREAUTH_DISCLAIMER,
      disclaimerTitle: PREAUTH_DISCLAIMER_TITLE,
    });
  } catch (error) {
    const host = (() => {
      try {
        return new URL(helcimApiBase().startsWith("http") ? helcimApiBase() : `https://${helcimApiBase()}`).host;
      } catch {
        return "helcim";
      }
    })();
    const detail = error instanceof Error ? error.message : "Could not start Helcim checkout.";
    const kind = body.purpose === "bid_preauth" ? "the $50 bid pre-auth" : "checkout";
    return NextResponse.json(
      { error: `Helcim (${host}) could not start ${kind}: ${detail}` },
      { status: 400 },
    );
  }
}
