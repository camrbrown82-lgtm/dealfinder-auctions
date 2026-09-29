import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot, listDemoLots } from "@/lib/demoAuctionStore";
import { settleEndedAuctions } from "@/lib/closeEndedLots";
import { currentLiveSale, saleKind } from "@/lib/liveSales";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { mapLot, type LotRow } from "@/lib/mappers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { ensureWeeklySales } from "@/lib/weeklySales";
import type { MonitorLot } from "@/lib/adminTypes";
import { isLotOpen, type AuctionEvent, type AuctionLot, type LotStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";

function asLotStatus(value: string | LotStatus | undefined): LotStatus | undefined {
  if (value === "draft" || value === "live" || value === "paused" || value === "ended" || value === "removed") {
    return value;
  }
  return undefined;
}

function withClock(lot: AuctionLot): AuctionLot {
  const clock = getDemoLot(lot.id);
  if (!clock) return lot;
  return {
    ...lot,
    status: asLotStatus(clock.status) ?? lot.status,
    highBidder: clock.highBidder ?? lot.highBidder ?? null,
    currentBid: clock.currentBid ?? lot.currentBid,
    endsAt: clock.endsAt ?? lot.endsAt,
  };
}

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

function monitorRows(
  lots: AuctionLot[],
  events: AuctionEvent[],
  bidCount: (lotId: string) => number,
): MonitorLot[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return lots
    .filter((lot) => lot.saleChannel !== "buy_now")
    .map((lot) => {
      const event = lot.eventId ? byId.get(lot.eventId) : undefined;
      const kind = event && !event.archivedAt ? saleKind(event) : null;
      return {
        lot,
        kind,
        bids: bidCount(lot.id),
        auctionNumber: event?.auctionNumber ?? lot.auctionNumber ?? null,
      };
    })
    .filter((row) => {
      if (!isLotOpen(row.lot)) return false;
      if (row.kind === "live") return true;
      return row.kind === "upcoming" && row.bids > 0;
    })
    .sort((a, b) => {
      const phase = a.kind === "upcoming" ? 1 : 0;
      const other = b.kind === "upcoming" ? 1 : 0;
      if (phase !== other) return phase - other;
      return new Date(a.lot.endsAt).getTime() - new Date(b.lot.endsAt).getTime();
    })
    .map((row) => ({
      id: row.lot.id,
      title: row.lot.title,
      lotNumber: row.lot.lotNumber,
      auctionNumber: row.auctionNumber,
      eventId: row.lot.eventId ?? null,
      status: row.lot.status,
      highBidder: row.lot.highBidder ?? null,
      currentBid: row.lot.currentBid,
      startingBid: row.lot.startingBid ?? row.lot.currentBid,
      reservePrice: row.lot.buyNowPrice ?? row.lot.reservePrice ?? 0,
      buyNowPrice: row.lot.buyNowPrice ?? row.lot.reservePrice ?? 0,
      endsAt: row.lot.endsAt,
      bidCount: row.bids,
      salePhase: row.kind === "upcoming" ? "upcoming" : "live",
    }));
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  await settleEndedAuctions().catch(() => undefined);

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    await ensureWeeklySales(supabase).catch(() => undefined);
    const { data: eventRows } = await supabase.from("auction_events").select("*");
    const events: AuctionEvent[] = (eventRows ?? []).map((row) =>
      mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]),
    );
    const { data } = await supabase.from("lots").select("*").in("status", ["live", "paused"]);
    const [{ data: bidCounts }, { data: absenteeCounts }] = await Promise.all([
      supabase.from("bids").select("lot_id"),
      supabase.from("absentee_bids").select("lot_id"),
    ]);
    const count = new Map<string, number>();
    for (const row of [...(bidCounts ?? []), ...(absenteeCounts ?? [])]) {
      const id = row.lot_id as string;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    const lots = monitorRows(
      ((data ?? []) as LotRow[]).map((row) => mapLot(row)),
      events,
      (lotId) => count.get(lotId) ?? 0,
    );
    return NextResponse.json({ lots, sale: salePayload(events), source: "supabase" });
  }

  const demo = getAdminDemo();
  stampAuctionNumbers(demo);
  const clocks = listDemoLots();
  const lots = monitorRows(
    demo.inventory.filter((lot) => lot.status === "live" || lot.status === "paused").map(withClock),
    demo.events,
    (lotId) => getDemoLot(lotId)?.bids.length ?? 0,
  );

  return NextResponse.json({ lots, sale: salePayload(demo.events), source: "demo", clockCount: clocks.length });
}
