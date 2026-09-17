import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { fetchLiveCatalog } from "@/lib/lots";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { MonitorLot } from "@/lib/adminTypes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  const catalog = await fetchLiveCatalog();
  const supabase = getSupabaseAdmin();
  const count = new Map<string, number>();
  if (isSupabaseConfigured && supabase) {
    const { data: bidCounts } = await supabase.from("bids").select("lot_id");
    for (const row of bidCounts ?? []) {
      const id = row.lot_id as string;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }

  const lots: MonitorLot[] = catalog.lots.map((lot) => ({
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
  }));

  return NextResponse.json({
    lots,
    source: isSupabaseConfigured ? "supabase" : "demo",
  });
}
