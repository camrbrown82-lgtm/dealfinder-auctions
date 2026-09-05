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
