import { NextRequest, NextResponse } from "next/server";
import { getBidderSession } from "@/lib/bidderAuth";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { mapLot, type LotRow } from "@/lib/mappers";
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
import { saveWinFulfillment } from "@/lib/winFulfillment";
import type { WinInvoice } from "@/lib/winTypes";
import { isLotPaid, lotPaidRecord } from "@/lib/helcim";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getBidderSession();
  if (!session) return NextResponse.json({ wins: [] as WinInvoice[] });

  let lots: AuctionLot[] = [];

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: byId } = await supabase
        .from("lots")
        .select("*")
        .eq("high_bidder_id", session.id);
      let rows = (byId ?? []) as LotRow[];
      if (session.fullName) {
        const { data: byName } = await supabase
          .from("lots")
          .select("*")
          .eq("high_bidder", session.fullName);
        const seen = new Set(rows.map((row) => row.id));
        for (const row of (byName ?? []) as LotRow[]) {
          if (!seen.has(row.id)) rows.push(row);
        }
      }
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
        paidAt: demo.paidAt ?? lot.paidAt ?? null,
        helcimPurchaseTransactionId:
          demo.helcimPurchaseTransactionId ?? lot.helcimPurchaseTransactionId ?? null,
      };
    }).filter(
      (lot) => lot.highBidderId === session.id || lot.highBidder === session.fullName,
    );
  }

  const address = profileAddress(session);
  const wins: WinInvoice[] = lots.map((lot) => {
    const invoice = invoiceNumber(lot.id, session.id);
    const memory = lotPaidRecord(lot.id);
    const paid = isLotPaid(lot) || Boolean(memory);
    return {
      lotId: lot.id,
      title: lot.title,
      slug: lot.slug,
      currentBid: lot.currentBid,
      status: lot.status,
      invoice,
      paymentMethodKey: "helcim_card",
      paymentMethod: paymentMethodLabel("helcim_card"),
      instructions: paymentInstructions("helcim_card", invoice),
      winning: lot.status === "ended",
      fulfillment: lot.fulfillment ?? "unset",
      address,
      paid,
      paidAt: lot.paidAt ?? memory?.paidAt ?? null,
    };
  });

  return NextResponse.json({ wins, profile: session });
}

export async function PATCH(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) {
    return NextResponse.json({ error: "Log in to choose shipping." }, { status: 401 });
  }
  const body = (await request.json()) as { lotId?: string; fulfillment?: FulfillmentChoice };
  if (!body.lotId || !isFulfillmentChoice(body.fulfillment) || body.fulfillment === "unset") {
    return NextResponse.json({ error: "Pick ship or pick up for a won lot." }, { status: 400 });
  }

  let lot: AuctionLot | null = null;
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from("lots").select("*").eq("id", body.lotId).maybeSingle();
      lot = data ? mapLot(data as LotRow) : null;
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
  }

  if (!lot) return NextResponse.json({ error: "Lot not found." }, { status: 404 });
  const owns =
    lot.highBidderId === session.id ||
    lot.highBidder === session.fullName ||
    lot.highBidder === session.email;
  if (!owns) {
    return NextResponse.json({ error: "Only the winner can choose ship or pick up." }, { status: 403 });
  }
  if (lot.status !== "ended") {
    return NextResponse.json({ error: "Choose shipping after the hammer." }, { status: 400 });
  }

  try {
    await saveWinFulfillment(body.lotId, body.fulfillment, session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save delivery choice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, fulfillment: body.fulfillment });
}
