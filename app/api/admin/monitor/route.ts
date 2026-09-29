import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { settleEndedAuctions } from "@/lib/closeEndedLots";
import { currentLiveSale, lotsForLiveMonitor } from "@/lib/liveSales";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { mapLot, type LotRow } from "@/lib/mappers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ensureWeeklySales } from "@/lib/weeklySales";
import type { MonitorLot } from "@/lib/adminTypes";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";

export const dynamic = "force-dynamic";

function salePayload(events: AuctionEvent[]) {
  const sale = currentLiveSale(events);
  if (!sale) return null;
  return {
    id: sale.id,
    name: sale.name,
    auctionNumber: sale.auctionNumber ?? null,
    endsAt: sale.endsAt,
  };
}

function toMonitorLot(lot: AuctionLot, bidCount: number, extra?: Partial<MonitorLot>): MonitorLot {
  return {
    id: lot.id,
    title: lot.title,
    lotNumber: lot.lotNumber,
    auctionNumber: extra?.auctionNumber ?? lot.auctionNumber,
    eventId: extra?.eventId ?? lot.eventId ?? null,
    status: extra?.status ?? lot.status,
    highBidder: extra?.highBidder ?? lot.highBidder ?? null,
    currentBid: extra?.currentBid ?? lot.currentBid,
    startingBid: lot.startingBid ?? lot.currentBid,
    reservePrice: lot.buyNowPrice ?? lot.reservePrice ?? 0,
    buyNowPrice: lot.buyNowPrice ?? lot.reservePrice ?? 0,
    endsAt: extra?.endsAt ?? lot.endsAt,
    bidCount,
  };
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  await settleEndedAuctions().catch(() => undefined);

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    await ensureWeeklySales(supabase).catch(() => undefined);
    const eventsRes = await supabase.from("auction_events").select("*").order("starts_at", { ascending: true });
    const events: AuctionEvent[] = (eventsRes.data ?? []).map((row) =>
      mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]),
    );
    const current = currentLiveSale(events);
    if (!current) {
      return NextResponse.json({ lots: [], sale: null, source: "supabase" });
    }
    const [{ data }, { data: bidCounts }] = await Promise.all([
      supabase.from("lots").select("*").in("status", ["live", "paused"]).eq("event_id", current.id),
      supabase.from("bids").select("lot_id"),
    ]);
    const count = new Map<string, number>();
    for (const row of [...(bidCounts ?? []), ...(absenteeCounts ?? [])]) {
      const id = row.lot_id as string;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    const numbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
    const mapped = ((data ?? []) as LotRow[]).map((row) => {
      const lot = mapLot(row);
      lot.auctionNumber = lot.eventId ? numbers.get(lot.eventId) ?? lot.auctionNumber : lot.auctionNumber;
      return lot;
    });
    const lots: MonitorLot[] = lotsForLiveMonitor(mapped, events).map((lot) =>
      toMonitorLot(lot, count.get(lot.id) ?? 0),
    );
    return NextResponse.json({ lots, sale: salePayload(events), source: "supabase" });
  }

  const demo = getAdminDemo();
  stampAuctionNumbers(demo);
  const lots: MonitorLot[] = lotsForLiveMonitor(demo.inventory, demo.events).map((lot) => {
    const clock = getDemoLot(lot.id);
    return toMonitorLot(lot, clock?.bids.length ?? 0, {
      status: clock?.status ?? lot.status,
      highBidder: clock?.highBidder ?? lot.highBidder ?? null,
      currentBid: clock?.currentBid ?? lot.currentBid,
      endsAt: clock?.endsAt ?? lot.endsAt,
    });
  });

  return NextResponse.json({ lots, sale: salePayload(demo.events), source: "demo" });
}
