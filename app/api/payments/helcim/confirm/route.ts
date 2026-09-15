import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import {
  clientIp,
  dropHelcimSession,
  helcimHashMatches,
  isHelcimConfigured,
  markLotPaid,
  markSettlementPaid,
  parseHelcimEventMessage,
  persistBidderPreauth,
  readHelcimSession,
  recordHelcimTransaction,
  releaseBidderPreauth,
} from "@/lib/helcim";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();

  const body = (await request.json()) as {
    checkoutToken?: string;
    eventMessage?: unknown;
    demo?: boolean;
  };
  const checkoutToken = String(body.checkoutToken ?? "").trim();
  if (!checkoutToken) {
    return NextResponse.json({ error: "checkoutToken is required." }, { status: 400 });
  }

  const stored = await readHelcimSession(checkoutToken);
  if (!stored || stored.bidderId !== session.id) {
    return NextResponse.json({ error: "Helcim checkout session expired. Try again." }, { status: 400 });
  }

  const demo = stored.demo || checkoutToken.startsWith("demo-") || !isHelcimConfigured();
  let transactionId = demo ? `demo-${crypto.randomUUID()}` : "";
  let cardToken: string | null = null;
  let customerCode: string | null = null;
  let status = "APPROVED";
  let payload: Record<string, unknown> = { demo: true };

  if (!demo) {
    try {
      const parsed = parseHelcimEventMessage(body.eventMessage);
      if (stored.secretToken && stored.secretToken !== "demo") {
        const ok = helcimHashMatches(parsed.data, parsed.hash, stored.secretToken);
        if (!ok) {
          return NextResponse.json({ error: "Helcim response could not be verified." }, { status: 400 });
        }
      }
      if (String(parsed.data.status || "").toUpperCase() === "DECLINED") {
        return NextResponse.json({ error: "Card was declined." }, { status: 402 });
      }
      transactionId = String(parsed.data.transactionId ?? "");
      cardToken = parsed.data.cardToken ? String(parsed.data.cardToken) : null;
      customerCode = parsed.data.customerCode ? String(parsed.data.customerCode) : null;
      status = String(parsed.data.status || "APPROVED");
      payload = parsed.data;
      if (!transactionId) {
        return NextResponse.json({ error: "Helcim did not return a transaction id." }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not read Helcim response." },
        { status: 400 },
      );
    }
  }

  try {
    if (stored.purpose === "bid_preauth") {
      await persistBidderPreauth(session.id, {
        status: "held",
        transactionId,
        cardToken,
        customerCode,
        amount: stored.amount,
      });
      await recordHelcimTransaction({
        bidderId: session.id,
        lotId: stored.lotId,
        purpose: "bid_preauth",
        transactionId,
        cardToken,
        customerCode,
        amount: stored.amount,
        currency: stored.currency,
        status,
        raw: payload,
      });
      await dropHelcimSession(checkoutToken);
      return NextResponse.json({
        ok: true,
        purpose: stored.purpose,
        demo,
        preauthStatus: "held",
        amount: stored.amount,
      });
    }

    if (!stored.lotId) {
      return NextResponse.json({ error: "Missing lot for this Helcim purchase." }, { status: 400 });
    }
    const paid = await markLotPaid(stored.lotId, transactionId);
    if (stored.invoiceNumber) await markSettlementPaid(stored.invoiceNumber);
    await recordHelcimTransaction({
      bidderId: session.id,
      lotId: stored.lotId,
      purpose: "checkout_purchase",
      transactionId,
      cardToken,
      customerCode,
      amount: stored.amount,
      currency: stored.currency,
      status,
      raw: payload,
    });
    let released = false;
    try {
      const result = await releaseBidderPreauth(session, clientIp(request));
      released = result.released;
    } catch (error) {
      await dropHelcimSession(checkoutToken);
      return NextResponse.json({
        ok: true,
        purpose: stored.purpose,
        demo,
        paid: true,
        paidAt: paid.paidAt,
        preauthReleased: false,
        warning:
          error instanceof Error
            ? `Hammer captured, but the $50 hold could not be reversed yet: ${error.message}`
            : "Hammer captured, but the $50 hold could not be reversed yet.",
      });
    }
    await dropHelcimSession(checkoutToken);
    return NextResponse.json({
      ok: true,
      purpose: stored.purpose,
      demo,
      paid: true,
      paidAt: paid.paidAt,
      preauthReleased: released,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record Helcim payment." },
      { status: 400 },
    );
  }
}
