import { listDemoLots } from "@/lib/demoAuctionStore";
import { patchLotRow } from "@/lib/openFloor";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { MOCK_LOTS } from "@/lib/utils";

export type ForfeitLot = {
  id: string;
  title?: string | null;
};

export async function forfeitBidderBids(bidderId: string, bidderName?: string | null): Promise<ForfeitLot[]> {
  const demo = listDemoLots().filter(
    (lot) =>
      !lot.paidAt &&
      (lot.highBidderId === bidderId || (bidderName && lot.highBidder === bidderName)),
  );
  for (const lot of demo) {
    const seed = MOCK_LOTS.find((row) => row.id === lot.id);
    lot.highBidder = null;
    lot.highBidderId = null;
    lot.status = "live";
    lot.fulfillment = "unset";
    lot.currentBid = seed?.startingBid ?? seed?.currentBid ?? lot.currentBid;
    lot.absentees = lot.absentees.filter((row) => row.bidder !== bidderName);
  }
  const forfeited: ForfeitLot[] = demo.map((lot) => ({ id: lot.id }));

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return forfeited;

  type LotRow = {
    id: string;
    title?: string | null;
    starting_bid?: number | string | null;
    current_bid?: number | string | null;
    high_bidder?: string | null;
    high_bidder_id?: string | null;
    paid_at?: string | null;
  };
  let query = supabase
    .from("lots")
    .select("id, title, starting_bid, current_bid, high_bidder, high_bidder_id, paid_at")
    .is("paid_at", null);
  const { data: byId, error } = await query.eq("high_bidder_id", bidderId);
  let rows: LotRow[] = (byId as LotRow[] | null) ?? [];
  if (error && /paid_at/i.test(error.message)) {
    const fallback = await supabase
      .from("lots")
      .select("id, title, starting_bid, current_bid, high_bidder, high_bidder_id")
      .eq("high_bidder_id", bidderId);
    rows = (fallback.data as LotRow[] | null) ?? [];
  }
  if (bidderName) {
    const { data: byName } = await supabase
      .from("lots")
      .select("id, title, starting_bid, current_bid, high_bidder, high_bidder_id, paid_at")
      .eq("high_bidder", bidderName)
      .is("paid_at", null);
    const seen = new Set(rows.map((row) => String(row.id)));
    for (const row of byName ?? []) {
      if (!seen.has(String(row.id))) rows.push(row);
    }
  }

  for (const row of rows) {
    if (row.paid_at) continue;
    const starting = Number(row.starting_bid ?? row.current_bid ?? 0);
    const patch: Record<string, unknown> = {
      high_bidder: null,
      high_bidder_id: null,
      current_bid: starting,
      status: "live",
      fulfillment: "unset",
    };
    const rest = await patchLotRow(String(row.id), patch);
    if (!rest.ok) {
      await supabase.from("lots").update(patch).eq("id", row.id);
    }
    forfeited.push({ id: String(row.id), title: row.title ?? null });
    if (bidderName) {
      await supabase.from("absentee_bids").delete().eq("lot_id", row.id).eq("bidder_name", bidderName);
    }
  }
  return forfeited;
}

export async function forfeitLotWin(lotId: string) {
  const demo = listDemoLots().find((lot) => lot.id === lotId);
  if (demo && !demo.paidAt) {
    const seed = MOCK_LOTS.find((row) => row.id === demo.id);
    demo.highBidder = null;
    demo.highBidderId = null;
    demo.status = "live";
    demo.fulfillment = "unset";
    demo.currentBid = seed?.startingBid ?? seed?.currentBid ?? demo.currentBid;
  }
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return;
  const { data } = await supabase
    .from("lots")
    .select("id, starting_bid, current_bid, paid_at")
    .eq("id", lotId)
    .maybeSingle();
  if (!data || data.paid_at) return;
  const starting = Number(data.starting_bid ?? data.current_bid ?? 0);
  await patchLotRow(lotId, {
    high_bidder: null,
    high_bidder_id: null,
    current_bid: starting,
    status: "live",
    fulfillment: "unset",
  });
}
