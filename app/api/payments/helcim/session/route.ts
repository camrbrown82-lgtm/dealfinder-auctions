import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
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
        return { amount: Number(data.current_bid), title: String(data.title ?? "Lot") };
      }
    }
  }
  const demo = getDemoLot(lotId);
  if (demo?.paidAt) return { error: "This invoice is already paid." };
  const fallback = demo || MOCK_LOTS.find((row) => row.id === lotId);
  if (!fallback) return { error: "Lot not found." };
  return { amount: Number(fallback.currentBid), title: "Lot" };
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();

  const body = (await request.json()) as { purpose?: string; lotId?: string };
  if (!isPurpose(body.purpose)) {
    return NextResponse.json({ error: "Unknown Helcim checkout purpose." }, { status: 400 });
  }

  const payment = await loadBidderPayment(session.id);
  const currency = helcimCurrency();
  let amount = preauthAmount();
  let invoice = `DF-HOLD-${session.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
  let lotId: string | null = body.lotId?.trim() || null;

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
      amount,
      currency,
      invoiceNumber: invoice,
      demo: true,
      createdAt,
    });
    return NextResponse.json({
      demo: true,
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
      amount,
      currency,
      invoiceNumber: invoice,
      demo: false,
      createdAt,
    });
    return NextResponse.json({
      demo: false,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Helcim checkout." },
      { status: 400 },
    );
  }
}
