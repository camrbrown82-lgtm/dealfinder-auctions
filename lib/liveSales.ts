import { lotWasSold } from "@/lib/settlements";
import { isLotOpen, type AuctionEvent, type AuctionLot } from "@/lib/utils";
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

/** Current week, plus up to two past weeks and any later weeks. Past and upcoming are view only. */
export function pickSaleWindow(events: AuctionEvent[], now = Date.now()): SaleWindowItem[] {
  const weekly = events.filter((event) => !event.archivedAt && isWeeklySale(event));
  const sorted = (weekly.length ? weekly : events.filter((event) => !event.archivedAt)).sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const tagged = sorted.map((event) => ({
    event,
    kind: saleKind(event, now),
  }));
  const past = tagged.filter((item) => item.kind === "past").slice(-2);
  const live = tagged.filter((item) => item.kind === "live");
  const upcoming = tagged.filter((item) => item.kind === "upcoming");
  return [...past, ...live, ...upcoming];
}

export function currentLiveEvent(events: AuctionEvent[], now = Date.now()) {
  return events.find((event) => !event.archivedAt && saleKind(event, now) === "live") ?? null;
}

function edmontonDateKey(now = Date.now()) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
}

/** Hammer day encoded in AU-YYYY-MMDD, otherwise the sale end in Alberta. */
function auctionHammerDate(event: Pick<AuctionEvent, "auctionNumber" | "endsAt">) {
  const match = event.auctionNumber?.match(/(\d{4})-(\d{2})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const end = new Date(event.endsAt);
  if (Number.isNaN(end.getTime())) return null;
  return end.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
}

/** Current week and later sales. Ended weeks stay off posting lists even if their clock was left open. */
export function canPostIntoSale(event: AuctionEvent, now = Date.now()) {
  if (event.archivedAt) return false;
  const end = new Date(event.endsAt).getTime();
  if (!Number.isFinite(end) || end <= now) return false;
  const hammer = auctionHammerDate(event);
  if (hammer && hammer < edmontonDateKey(now)) return false;
  return saleKind(event, now) !== "past";
}

export function salesOpenForPosting(events: AuctionEvent[], now = Date.now()) {
  return events
    .filter((event) => canPostIntoSale(event, now))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
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
    if (lot.saleChannel === "buy_now") return false;
    if (lot.status === "removed" || lot.status === "draft") return false;
    const onThisSale = lot.eventId === sale.event.id || (isFirstWeek && !lot.eventId && sale.kind === "live");
    if (!onThisSale) return false;
    if (sale.kind === "past") return true;
    if (lot.status === "ended" || lotWasSold(lot)) return false;
    if (sale.kind === "upcoming") return true;
    return isLotOpen(lot);
  });
}
