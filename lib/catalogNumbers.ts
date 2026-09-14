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

export function parseLotSeq(value?: string | null) {
  const match = (value ?? "").trim().toUpperCase().match(/^(?:LOT-)?(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function formatLotNumber(n: number) {
  const value = Math.max(1, Math.floor(n));
  return `LOT-${String(value).padStart(Math.max(4, String(value).length), "0")}`;
}

export function nextFreeLotNumber(
  start: number,
  existing: Array<{ lotNumber?: string | null }>,
) {
  const taken = new Set<string>();
  for (const row of existing) {
    const raw = (row.lotNumber ?? "").trim().toUpperCase();
    if (!raw) continue;
    taken.add(raw);
    const n = parseLotSeq(raw);
    if (n != null) {
      taken.add(formatLotNumber(n));
      taken.add(String(n));
    }
  }
  let n = Math.max(1, Math.floor(start));
  while (taken.has(formatLotNumber(n)) || taken.has(String(n))) n += 1;
  return formatLotNumber(n);
}

export function suggestLotNumber(existing: Array<{ lotNumber?: string | null }>) {
  let max = 0;
  for (const row of existing) {
    const n = parseLotSeq(row.lotNumber);
    if (n != null && n > max) max = n;
  }
  return formatLotNumber(max + 1);
}

export function compareLotNumbers(a?: string | null, b?: string | null) {
  const left = parseLotSeq(a);
  const right = parseLotSeq(b);
  if (left != null && right != null && left !== right) return left - right;
  return (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });
}

export function sortLotsByNumber<T extends { lotNumber?: string | null }>(lots: T[]) {
  return [...lots].sort((a, b) => compareLotNumbers(a.lotNumber, b.lotNumber));
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
