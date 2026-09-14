import { NextResponse } from "next/server";
import { getBidderSession } from "@/lib/bidderAuth";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { mapLot, type LotRow } from "@/lib/mappers";
import {
  invoiceNumber,
  paymentInstructions,
  paymentMethodLabel,
} from "@/lib/payments";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { MOCK_LOTS, type AuctionLot } from "@/lib/utils";
import type { WinInvoice } from "@/lib/winTypes";

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
      };
    }).filter(
      (lot) => lot.highBidderId === session.id || lot.highBidder === session.fullName,
    );
  }

  const wins: WinInvoice[] = lots.map((lot) => {
    const invoice = invoiceNumber(lot.id, session.id);
    return {
      lotId: lot.id,
      title: lot.title,
      slug: lot.slug,
      currentBid: lot.currentBid,
      status: lot.status,
      invoice,
      paymentMethodKey: session.paymentMethod,
      paymentMethod: paymentMethodLabel(session.paymentMethod),
      instructions: paymentInstructions(session.paymentMethod, invoice),
      winning: lot.status === "ended",
    };
  });

  return NextResponse.json({ wins, profile: session });
}
