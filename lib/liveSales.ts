import { lotWasSold } from "@/lib/settlements";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";
import { FIRST_WEEKLY_SALE, WEEKLY_SALES, isWeeklySale } from "@/lib/weeklySales";

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

function matchPlan(open: AuctionEvent[], plan: (typeof WEEKLY_SALES)[number]) {
  const isFirst = plan.auctionNumber === FIRST_WEEKLY_SALE.auctionNumber;
  return (
    open.find((event) => event.auctionNumber === plan.auctionNumber) ??
    open.find((event) => event.name === plan.name) ??
    (isFirst
      ? open.find((event) => event.auctionNumber === FIRST_WEEKLY_SALE.legacyNumber)
      : undefined)
  );
}

/** Five weekly hammers, preferring Sep 20 numbers over leftover AU-2026-001 rows. */
export function pickSaleWindow(events: AuctionEvent[], now = Date.now()): SaleWindowItem[] {
  const open = events.filter((event) => !event.archivedAt);
  const planned = WEEKLY_SALES.map((plan) => matchPlan(open, plan)).filter(
    (event): event is AuctionEvent => Boolean(event),
  );
  const sorted = (planned.length ? planned : open.filter((event) => isWeeklySale(event) || !event.archivedAt)).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const seen = new Set<string>();
  return sorted
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .map((event) => ({
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

export function laterSaleIds(events: AuctionEvent[]) {
  const numbers = new Set(WEEKLY_SALES.slice(1).map((sale) => sale.auctionNumber));
  return new Set(
    events
      .filter((event) => !event.archivedAt && event.auctionNumber && numbers.has(event.auctionNumber))
      .map((event) => event.id),
  );
}

export function isFirstWeekSale(sale: SaleWindowItem) {
  return (
    sale.event.auctionNumber === FIRST_WEEKLY_SALE.auctionNumber ||
    sale.event.auctionNumber === FIRST_WEEKLY_SALE.legacyNumber ||
    sale.event.name === FIRST_WEEKLY_SALE.name
  );
}

export function lotsForSale(
  lots: AuctionLot[],
  sale: SaleWindowItem | undefined,
  window: SaleWindowItem[] = [],
) {
  const floor = lots.filter((lot) => {
    if (lot.status === "removed" || lot.status === "draft" || lot.status === "ended") return false;
    if (lotWasSold(lot)) return false;
    return true;
  });
  if (!sale) return floor;
  const later = laterSaleIds([...window.map((item) => item.event), sale.event]);
  if (sale.kind === "live" || isFirstWeekSale(sale)) {
    return floor.filter((lot) => !lot.eventId || !later.has(lot.eventId));
  }
  return floor.filter((lot) => lot.eventId === sale.event.id);
}
