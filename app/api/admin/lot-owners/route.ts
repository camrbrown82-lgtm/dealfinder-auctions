import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic. Shows who each lot says it belongs to so a stale or
 * mismatched bidder id is visible. Delete once the checkout leak is settled.
 */
export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }

  const [lotsRes, profilesRes, bidsRes] = await Promise.all([
    supabase
      .from("lots")
      .select("id, lot_number, title, status, high_bidder, high_bidder_id, paid_at, sale_source, buy_now_status, ends_at")
      .order("lot_number", { ascending: true }),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("bids").select("lot_id, bidder_id, bidder_name, amount, created_at"),
  ]);

  const nameById = new Map(
    (profilesRes.data ?? []).map((row) => [
      String(row.id),
      { name: String(row.full_name ?? ""), email: String(row.email ?? "") },
    ]),
  );

  const bidsByLot = new Map<string, Array<{ bidderId: string | null; name: string; amount: number }>>();
  for (const row of bidsRes.data ?? []) {
    const lotId = String(row.lot_id ?? "");
    const list = bidsByLot.get(lotId) ?? [];
    list.push({
      bidderId: (row.bidder_id as string | null) ?? null,
      name: String(row.bidder_name ?? ""),
      amount: Number(row.amount ?? 0),
    });
    bidsByLot.set(lotId, list);
  }

  const lots = (lotsRes.data ?? []).map((row) => {
    const id = String(row.id);
    const ownerId = (row.high_bidder_id as string | null) ?? null;
    const owner = ownerId ? nameById.get(ownerId) : undefined;
    const name = String(row.high_bidder ?? "");
    const tape = (bidsByLot.get(id) ?? []).sort((a, b) => b.amount - a.amount);
    const top = tape[0];
    return {
      lot: row.lot_number ?? id.slice(0, 8),
      title: String(row.title ?? ""),
      status: row.status,
      saleSource: row.sale_source ?? null,
      buyNowStatus: row.buy_now_status ?? null,
      paid: Boolean(row.paid_at),
      highBidderName: name || null,
      highBidderId: ownerId,
      idResolvesTo: owner ? `${owner.name} <${owner.email}>` : ownerId ? "ID NOT IN PROFILES" : null,
      mismatch: Boolean(ownerId && owner && name && owner.name !== name),
      topBid: top ? `${top.name} (${top.bidderId ?? "no id"}) $${top.amount}` : null,
      bidCount: tape.length,
    };
  });

  return NextResponse.json({
    profiles: (profilesRes.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.full_name ?? ""),
      email: String(row.email ?? ""),
    })),
    mismatched: lots.filter((lot) => lot.mismatch),
    lots,
  });
}
