import { lotClockEnded, lotWasSold } from "@/lib/settlements";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";
import { FIRST_WEEKLY_SALE, isWeeklySale } from "@/lib/weeklySales";

export type SaleKind = "past" | "live" | "upcoming";

export type SaleWindowItem = {
  event: AuctionEvent;
  kind: SaleKind;
};

/** Live only while startsAt <= now < endsAt. Exact close is past, not live. */
export function saleKind(event: AuctionEvent, now = Date.now()): SaleKind {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (end <= now) return "past";
  if (start > now) return "upcoming";
  return "live";
}

function openWeeklyEvents(events: AuctionEvent[]) {
  const weekly = events.filter((event) => !event.archivedAt && isWeeklySale(event));
  return (weekly.length ? weekly : events.filter((event) => !event.archivedAt)).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

/**
 * Public floor window: current in-progress weekly sale, at most two previous hammers
 * for viewing, and later weekly sales as upcoming (never live).
 */
export function pickSaleWindow(events: AuctionEvent[], now = Date.now()): SaleWindowItem[] {
  const classified = openWeeklyEvents(events).map((event) => ({
    event,
    kind: saleKind(event, now),
  }));
  const past = classified.filter((item) => item.kind === "past").slice(-2);
  const liveAll = classified.filter((item) => item.kind === "live");
  const live = liveAll.slice(-1);
  const upcoming = classified.filter((item) => item.kind === "upcoming");
  return [...past, ...live, ...upcoming];
}

export function defaultSaleId(window: SaleWindowItem[]) {
  const pastNewestFirst = [...window].filter((item) => item.kind === "past").reverse();
  return (
    window.find((item) => item.kind === "live") ??
    pastNewestFirst[0] ??
    window[0]
  )?.event.id;
}

export function lotsForSale(lots: AuctionLot[], sale: SaleWindowItem | undefined) {
  if (!sale) return [];
  const isFirstWeek =
    sale.event.auctionNumber === FIRST_WEEKLY_SALE.auctionNumber ||
    sale.event.auctionNumber === FIRST_WEEKLY_SALE.legacyNumber ||
    sale.event.name === FIRST_WEEKLY_SALE.name;
  return lots.filter((lot) => {
    if (lot.saleChannel === "buy_now") return false;
    if (lot.status === "removed" || lot.status === "draft" || lot.status === "ended") return false;
    if (lotWasSold(lot)) return false;
    if (lotClockEnded(lot)) return false;
    if (lot.eventId === sale.event.id) return true;
    if (isFirstWeek && !lot.eventId && sale.kind === "live") return true;
    return false;
  });
}

/** The weekly sale whose clock is running right now, or null if none is live. */
export function currentLiveSale(events: AuctionEvent[], now = Date.now()) {
  const live = openWeeklyEvents(events).filter((event) => saleKind(event, now) === "live");
  return live.at(-1) ?? null;
}

/** Admin floor: only lots actually running on the current live auction. */
export function lotsForLiveMonitor(lots: AuctionLot[], events: AuctionEvent[], now = Date.now()) {
  const current = currentLiveSale(events, now);
  if (!current) return [];
  return lots.filter((lot) => {
    if (lot.saleChannel === "buy_now") return false;
    if (lot.status !== "live" && lot.status !== "paused") return false;
    if (lot.eventId !== current.id) return false;
    if (lotClockEnded(lot, now)) return false;
    if (lotWasSold(lot)) return false;
    return true;
  });
}
