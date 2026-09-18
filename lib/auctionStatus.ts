export function auctionIsClosed(event: { endsAt?: string | null; archivedAt?: string | null } | null | undefined) {
  if (!event) return false;
  if (event.archivedAt) return true;
  const ends = Date.parse(String(event.endsAt ?? ""));
  return Number.isFinite(ends) && ends <= Date.now();
}
