import type { LotRow } from "@/lib/mappers";
import type { getSupabaseAdmin } from "@/lib/supabaseClient";
import type { AuctionLot } from "@/lib/utils";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Paddle = { id: string; fullName: string };

/** Lots this paddle is on record bidding for, by bidder id. */
async function bidTapeLots(supabase: Admin, session: Paddle, lotIds: string[]) {
  const owned = new Set<string>();
  if (!lotIds.length) return owned;
  const { data } = await supabase
    .from("bids")
    .select("lot_id")
    .eq("bidder_id", session.id)
    .in("lot_id", lotIds);
  for (const row of data ?? []) owned.add(String(row.lot_id));
  return owned;
}

/** Absentee bids store only a name, so that is all there is to match on. */
async function absenteeLots(supabase: Admin, session: Paddle, lotIds: string[]) {
  const owned = new Set<string>();
  if (!lotIds.length || !session.fullName) return owned;
  const { data } = await supabase
    .from("absentee_bids")
    .select("lot_id")
    .eq("bidder_name", session.fullName)
    .in("lot_id", lotIds);
  for (const row of data ?? []) owned.add(String(row.lot_id));
  return owned;
}

function lotName(row: { high_bidder?: string | null }) {
  return String(row.high_bidder ?? "").trim();
}

/**
 * The id and the name on a lot should agree. When they disagree the row is
 * stale — a losing paddle's id can outlive an update that only managed to write
 * the winner's name — so the bid tape settles it.
 */
async function keepIdClaims(supabase: Admin, session: Paddle, rows: LotRow[]) {
  const conflicted = rows.filter((row) => {
    const name = lotName(row);
    return Boolean(name) && Boolean(session.fullName) && name !== session.fullName;
  });
  if (!conflicted.length) return rows;
  const proven = await bidTapeLots(
    supabase,
    session,
    conflicted.map((row) => String(row.id)),
  );
  const dropped = new Set(
    conflicted.filter((row) => !proven.has(String(row.id))).map((row) => String(row.id)),
  );
  return rows.filter((row) => !dropped.has(String(row.id)));
}

/**
 * Every lot row this paddle genuinely owns, and nothing else. Ownership runs on
 * the bidder id: a display name is not an identity, two accounts can carry the
 * same one, and matching on it hands a buyer somebody else's invoice.
 *
 * A name is trusted in exactly one place — an absentee win, where the lot has no
 * bidder id to read because absentee_bids never stored one.
 */
export async function fetchOwnedLotRows(supabase: Admin, session: Paddle): Promise<LotRow[]> {
  const { data: byId } = await supabase.from("lots").select("*").eq("high_bidder_id", session.id);
  const rows = await keepIdClaims(supabase, session, (byId ?? []) as LotRow[]);
  if (!session.fullName) return rows;

  const { data: unclaimed } = await supabase
    .from("lots")
    .select("*")
    .is("high_bidder_id", null)
    .eq("high_bidder", session.fullName);

  const seen = new Set(rows.map((row) => String(row.id)));
  const candidates = ((unclaimed ?? []) as LotRow[]).filter((row) => !seen.has(String(row.id)));
  if (!candidates.length) return rows;

  const ids = candidates.map((row) => String(row.id));
  const [bid, absentee] = await Promise.all([
    bidTapeLots(supabase, session, ids),
    absenteeLots(supabase, session, ids),
  ]);
  for (const row of candidates) {
    const id = String(row.id);
    if (bid.has(id) || absentee.has(id)) rows.push(row);
  }
  return rows;
}

/** The same rule for a single lot, checked before any invoice is changed. */
export async function sessionOwnsLot(
  supabase: Admin,
  session: Paddle,
  lot: Pick<AuctionLot, "id" | "highBidder" | "highBidderId">,
) {
  const name = String(lot.highBidder ?? "").trim();
  if (lot.highBidderId) {
    if (lot.highBidderId !== session.id) return false;
    if (!name || !session.fullName || name === session.fullName) return true;
    return (await bidTapeLots(supabase, session, [lot.id])).has(lot.id);
  }
  if (!session.fullName || name !== session.fullName) return false;
  const [bid, absentee] = await Promise.all([
    bidTapeLots(supabase, session, [lot.id]),
    absenteeLots(supabase, session, [lot.id]),
  ]);
  return bid.has(lot.id) || absentee.has(lot.id);
}

/** Demo store equivalent: id first, name only when no id was recorded. */
export function demoOwnsLot(
  session: Paddle,
  lot: Pick<AuctionLot, "highBidder" | "highBidderId">,
) {
  if (lot.highBidderId) return lot.highBidderId === session.id;
  return Boolean(session.fullName) && lot.highBidder === session.fullName;
}
