import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot, listDemoLots } from "@/lib/demoAuctionStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapLot, type LotRow } from "@/lib/mappers";
import type { MonitorLot } from "@/lib/adminTypes";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from("lots").select("*").in("status", ["live", "paused"]);
    const { data: bidCounts } = await supabase.from("bids").select("lot_id");
    const count = new Map<string, number>();
    for (const row of bidCounts ?? []) {
      const id = row.lot_id as string;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    const lots: MonitorLot[] = ((data ?? []) as LotRow[]).map((row) => {
      const lot = mapLot(row);
      return {
        id: lot.id,
        title: lot.title,
        lotNumber: lot.lotNumber,
        auctionNumber: lot.auctionNumber,
        status: lot.status,
        highBidder: lot.highBidder ?? null,
        currentBid: lot.currentBid,
        startingBid: lot.startingBid ?? lot.currentBid,
        reservePrice: lot.buyNowPrice ?? lot.reservePrice ?? 0,
        buyNowPrice: lot.buyNowPrice ?? lot.reservePrice ?? 0,
        endsAt: lot.endsAt,
        bidCount: count.get(lot.id) ?? 0,
      };
    });
    return NextResponse.json({ lots, source: "supabase" });
  }

  const demo = getAdminDemo();
  stampAuctionNumbers(demo);
  const clocks = listDemoLots();
  const lots: MonitorLot[] = demo.inventory
    .filter((lot) => lot.status === "live" || lot.status === "paused")
    .map((lot) => {
      const clock = getDemoLot(lot.id);
      return {
        id: lot.id,
        title: lot.title,
        lotNumber: lot.lotNumber,
        auctionNumber: lot.auctionNumber,
        status: clock?.status ?? lot.status,
        highBidder: clock?.highBidder ?? lot.highBidder ?? null,
        currentBid: clock?.currentBid ?? lot.currentBid,
        startingBid: lot.startingBid ?? lot.currentBid,
        reservePrice: lot.buyNowPrice ?? lot.reservePrice ?? 0,
        buyNowPrice: lot.buyNowPrice ?? lot.reservePrice ?? 0,
        endsAt: clock?.endsAt ?? lot.endsAt,
        bidCount: clock?.bids.length ?? 0,
      };
    });

  return NextResponse.json({ lots, source: "demo", clockCount: clocks.length });
}
