import { NextResponse } from "next/server";
import { getBidderSession } from "@/lib/bidderAuth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getBidderSession();
  if (!session || !isSupabaseConfigured) {
    return NextResponse.json({ bidLotIds: [] as string[], boughtLotIds: [] as string[] });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ bidLotIds: [], boughtLotIds: [] });

  const [bids, bought] = await Promise.all([
    supabase.from("bids").select("lot_id").eq("bidder_id", session.id),
    supabase.from("lots").select("id").eq("high_bidder_id", session.id),
  ]);
  const bidLotIds = Array.from(
    new Set((bids.data ?? []).map((row) => String(row.lot_id ?? "")).filter(Boolean)),
  );
  const boughtLotIds = Array.from(
    new Set((bought.data ?? []).map((row) => String(row.id ?? "")).filter(Boolean)),
  );
  return NextResponse.json({ bidLotIds, boughtLotIds });
}
