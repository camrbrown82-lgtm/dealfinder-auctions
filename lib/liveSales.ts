import { lotWasSold } from "@/lib/settlements";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";
import { FIRST_WEEKLY_SALE, isWeeklySale } from "@/lib/weeklySales";

export type SaleKind = "past" | "live" | "upcoming";

export type SaleWindowItem = {
  event: AuctionEvent;
  kind: SaleKind;
};

export function saleKind(event: AuctionEvent, now = Date.now()): SaleKind {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (end < now) return "past";
  if (start > now) return "upcoming";
  return "live";
}

/** Current sale plus up to two previous and two upcoming. */
export function pickSaleWindow(events: AuctionEvent[], now = Date.now()): SaleWindowItem[] {
  const weekly = events.filter((event) => !event.archivedAt && isWeeklySale(event));
  const sorted = (weekly.length ? weekly : events.filter((event) => !event.archivedAt)).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  return sorted.map((event) => ({
    event,
    kind: saleKind(event, now),
  }));
}

export function defaultSaleId(window: SaleWindowItem[]) {
  return (
    window.find((item) => item.kind === "live") ??
    window.find((item) => item.kind === "upcoming") ??
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
    if (lot.status === "removed" || lot.status === "draft" || lot.status === "ended") return false;
    if (lotWasSold(lot)) return false;
    if (lot.eventId === sale.event.id) return true;
    if (isFirstWeek && !lot.eventId) return true;
    return false;
  });
}
