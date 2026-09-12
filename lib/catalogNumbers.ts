import type { AuctionEvent } from "@/lib/utils";

export function suggestAuctionNumber(existing: Array<{ auctionNumber?: string | null }>) {
  const year = new Date().getFullYear();
  const prefix = `AU-${year}-`;
  let max = 0;
  for (const row of existing) {
    const value = row.auctionNumber ?? "";
    if (!value.startsWith(prefix)) continue;
    const n = Number(value.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function suggestLotNumber(existing: Array<{ lotNumber?: string | null }>) {
  let max = 0;
  for (const row of existing) {
    const value = (row.lotNumber ?? "").toUpperCase();
    const match = value.match(/^LOT-(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (n > max) max = n;
  }
  return `LOT-${String(max + 1).padStart(4, "0")}`;
}

/** Next DealFinder sale: soonest upcoming event, else the one currently running. */
export function pickHouseAuction(events: AuctionEvent[], now = Date.now()) {
  const open = events.filter((event) => new Date(event.endsAt).getTime() > now);
  if (open.length === 0) return null;
  const upcoming = open.filter((event) => new Date(event.startsAt).getTime() > now);
  const pool = upcoming.length ? upcoming : open;
  return [...pool].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )[0];
}
