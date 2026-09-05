import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AdminBid } from "@/lib/adminTypes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const lotId = request.nextUrl.searchParams.get("lotId");
  if (!lotId) {
    return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("bids")
      .select("id, lot_id, bidder_name, bidder_email, bidder_id, amount, kind, created_at")
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const ids = Array.from(
      new Set((data ?? []).map((row) => row.bidder_id as string | null).filter(Boolean)),
    ) as string[];
    const emails = new Map<string, { email: string; name: string }>();
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ids);
      for (const row of profiles ?? []) {
        emails.set(row.id, { email: row.email ?? "", name: row.full_name ?? "" });
      }
    }

    const bids: AdminBid[] = (data ?? []).map((row) => {
      const profile = row.bidder_id ? emails.get(row.bidder_id) : undefined;
      return {
        id: row.id,
        lotId: row.lot_id,
        bidder: profile?.name || row.bidder_name,
        email: profile?.email || row.bidder_email || "",
        amount: Number(row.amount),
        kind: row.kind === "absentee" ? "absentee" : "live",
        createdAt: row.created_at,
        bidderId: row.bidder_id,
      };
    });
    return NextResponse.json({ bids });
  }

  const demo = getDemoLot(lotId);
  return NextResponse.json({ bids: (demo?.bids ?? []).slice().reverse() });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as { bidId?: string; lotId?: string };
  const bidId = body.bidId?.trim();
  const lotId = body.lotId?.trim();
  if (!bidId || !lotId) {
    return NextResponse.json({ error: "bidId and lotId are required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from("bids").delete().eq("id", bidId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: remaining } = await supabase
      .from("bids")
      .select("amount, bidder_name, bidder_id")
      .eq("lot_id", lotId)
      .order("amount", { ascending: false })
      .limit(1);
    const { data: lot } = await supabase
      .from("lots")
      .select("starting_bid")
      .eq("id", lotId)
      .maybeSingle();
    const top = remaining?.[0];
    const nextBid = top ? Number(top.amount) : Number(lot?.starting_bid ?? 0);
    await supabase
      .from("lots")
      .update({
        current_bid: nextBid,
        high_bidder: top?.bidder_name ?? null,
        high_bidder_id: top?.bidder_id ?? null,
      })
      .eq("id", lotId);

    return NextResponse.json({
      ok: true,
      currentBid: nextBid,
      highBidder: top?.bidder_name ?? null,
    });
  }

  const demo = getDemoLot(lotId);
  if (!demo) return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  demo.bids = demo.bids.filter((row) => row.id !== bidId);
  const top = demo.bids.slice().sort((a, b) => b.amount - a.amount)[0];
  const inventory = getAdminDemo().inventory.find((row) => row.id === lotId);
  const starting = inventory?.startingBid ?? inventory?.currentBid ?? 0;
  demo.currentBid = top ? top.amount : starting;
  demo.highBidder = top?.bidder ?? null;
  demo.highBidderId = top?.bidderId ?? null;
  if (inventory) {
    inventory.currentBid = demo.currentBid;
    inventory.highBidder = demo.highBidder;
  }

  return NextResponse.json({
    ok: true,
    currentBid: demo.currentBid,
    highBidder: demo.highBidder,
  });
}
