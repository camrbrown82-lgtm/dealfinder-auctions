import type { AuctionEvent, AuctionLot } from "@/lib/utils";

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
  const sorted = [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  if (!sorted.length) return [];

  let idx = sorted.findIndex((event) => saleKind(event, now) === "live");
  if (idx < 0) idx = sorted.findIndex((event) => saleKind(event, now) === "upcoming");
  if (idx < 0) idx = sorted.length - 1;

  return sorted.slice(Math.max(0, idx - 2), Math.min(sorted.length, idx + 3)).map((event) => ({
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
  const pool = lots.filter((lot) => lot.status !== "removed" && lot.status !== "draft");
  const inSale = pool.filter((lot) => lot.eventId === sale.event.id);
  if (sale.kind === "past") {
    return inSale.filter((lot) => lot.status === "ended");
  }
  if (sale.kind === "upcoming") {
    return inSale.filter((lot) => lot.status !== "ended");
  }
  return inSale.filter((lot) => lot.status === "live");
}
