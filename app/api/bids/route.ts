import { NextRequest, NextResponse } from "next/server";
import { getBidderSession, bidderUnauthorized } from "@/lib/bidderAuth";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { getAdminDemo } from "@/lib/demoAdminStore";
import {
  placeAbsenteeMax,
  placeLiveBid,
  type AuctionClock,
} from "@/lib/bidding";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { isProfileComplete } from "@/lib/profileTypes";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(request: NextRequest) {
  const lotId = request.nextUrl.searchParams.get("lotId");
  if (!lotId) {
    return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase && isUuid(lotId)) {
    const { data, error } = await supabase
      .from("bids")
      .select("bidder_name, amount, kind, created_at")
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      bids: (data ?? []).map((row) => ({
        bidder: row.bidder_name,
        amount: Number(row.amount),
        kind: row.kind === "absentee" ? "absentee" : "live",
      })),
    });
  }

  const demo = getDemoLot(lotId);
  return NextResponse.json({ bids: demo?.bids.slice().reverse() ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  if (session.status === "suspended") {
    return NextResponse.json(
      { error: "Bidding privileges are suspended." },
      { status: 403 },
    );
  }
  if (!isProfileComplete(session)) {
    return NextResponse.json(
      { error: "Finish your bidder profile before placing a bid." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    lotId?: string;
    mode?: "live" | "absentee" | "buy_now";
    amount?: number;
    maxAmount?: number;
  };

  const lotId = body.lotId?.trim();
  const bidder = session.fullName || session.email;
  if (!lotId) {
    return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase && isUuid(lotId)) {
    return persistSupabase(supabase, lotId, bidder, session.id, session.email, body);
  }

  return persistDemo(lotId, bidder, session.id, session.email, body);
}

async function persistDemo(
  lotId: string,
  bidder: string,
  bidderId: string,
  email: string,
  body: { mode?: "live" | "absentee" | "buy_now"; amount?: number; maxAmount?: number },
) {
  const demo = getDemoLot(lotId);
  if (!demo) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }
  if (demo.status !== "live" || new Date(demo.endsAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Lot is not open for bidding" }, { status: 400 });
  }

  if (body.mode === "buy_now") {
    const amount = Number(body.amount);
    if (!amount || amount <= demo.currentBid) {
      return NextResponse.json({ error: "Buy now is no longer available on this lot." }, { status: 400 });
    }
    demo.currentBid = amount;
    demo.highBidder = bidder;
    demo.highBidderId = bidderId;
    demo.status = "ended";
    demo.endsAt = new Date().toISOString();
    const stamped = {
      id: crypto.randomUUID(),
      lotId,
      bidder,
      email,
      amount,
      kind: "live" as const,
      createdAt: demo.endsAt,
      bidderId,
    };
    demo.bids.push(stamped);
    const inventory = getAdminDemo().inventory.find((row) => row.id === lotId);
    if (inventory) {
      inventory.currentBid = amount;
      inventory.status = "ended";
      inventory.endsAt = demo.endsAt;
      inventory.highBidder = bidder;
      inventory.highBidderId = bidderId;
    }
    return NextResponse.json({
      currentBid: demo.currentBid,
      endsAt: demo.endsAt,
      highBidder: demo.highBidder,
      events: [stamped],
      extended: false,
      boughtNow: true,
      status: "ended",
    });
  }

  const clock: AuctionClock = {
    currentBid: demo.currentBid,
    minIncrement: demo.minIncrement,
    endsAt: demo.endsAt,
    highBidder: demo.highBidder,
    absentees: demo.absentees,
  };

  try {
    const result =
      body.mode === "absentee"
        ? placeAbsenteeMax(clock, bidder, Number(body.maxAmount))
        : placeLiveBid(
            clock,
            bidder,
            Number(body.amount ?? demo.currentBid + demo.minIncrement),
          );

    demo.currentBid = result.state.currentBid;
    demo.endsAt = result.state.endsAt;
    demo.highBidder = result.state.highBidder;
    demo.highBidderId = result.state.highBidder === bidder ? bidderId : null;
    demo.absentees = result.state.absentees;
    const stamped = result.events.map((event) => ({
      id: crypto.randomUUID(),
      lotId,
      bidder: event.bidder,
      email: event.bidder === bidder ? email : "",
      amount: event.amount,
      kind: event.kind,
      createdAt: new Date().toISOString(),
      bidderId: event.bidder === bidder ? bidderId : null,
    }));
    demo.bids.push(...stamped);

    return NextResponse.json({
      currentBid: demo.currentBid,
      endsAt: demo.endsAt,
      highBidder: demo.highBidder,
      events: stamped,
      extended: result.extended,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bid failed" },
      { status: 400 },
    );
  }
}

async function persistSupabase(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  lotId: string,
  bidder: string,
  bidderId: string,
  email: string,
  body: { mode?: "live" | "absentee" | "buy_now"; amount?: number; maxAmount?: number },
) {
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .single();
  if (lotError || !lot) {
    return NextResponse.json({ error: lotError?.message || "Lot not found" }, { status: 404 });
  }

  const { data: absenteeRows } = await supabase
    .from("absentee_bids")
    .select("bidder_name, max_amount")
    .eq("lot_id", lotId);

  const clock: AuctionClock = {
    currentBid: Number(lot.current_bid),
    minIncrement: Number(lot.min_increment),
    endsAt: lot.ends_at,
    highBidder: lot.high_bidder,
    absentees: (absenteeRows ?? []).map((row) => ({
      bidder: row.bidder_name,
      max: Number(row.max_amount),
    })),
  };

  try {
    if (body.mode === "buy_now") {
      const buyNow = Number(lot.buy_now_price ?? lot.reserve_price ?? 0);
      if (!buyNow || buyNow <= Number(lot.current_bid)) {
        return NextResponse.json({ error: "Buy now is no longer available on this lot." }, { status: 400 });
      }
      const increment = Number(lot.min_increment) || 5;
      const { error: stageError } = await supabase
        .from("lots")
        .update({ current_bid: buyNow - increment })
        .eq("id", lotId);
      if (stageError) {
        return NextResponse.json({ error: stageError.message }, { status: 400 });
      }
      const { error: bidError } = await supabase.from("bids").insert({
        lot_id: lotId,
        bidder_name: bidder,
        bidder_id: bidderId,
        bidder_email: email,
        amount: buyNow,
        kind: "live",
      });
      if (bidError) {
        return NextResponse.json({ error: bidError.message }, { status: 400 });
      }
      const endedAt = new Date().toISOString();
      await supabase
        .from("lots")
        .update({
          current_bid: buyNow,
          high_bidder: bidder,
          high_bidder_id: bidderId,
          status: "ended",
          ends_at: endedAt,
        })
        .eq("id", lotId);
      return NextResponse.json({
        currentBid: buyNow,
        endsAt: endedAt,
        highBidder: bidder,
        events: [{ bidder, amount: buyNow, kind: "live" }],
        extended: false,
        boughtNow: true,
        status: "ended",
      });
    }

    const result =
      body.mode === "absentee"
        ? placeAbsenteeMax(clock, bidder, Number(body.maxAmount))
        : placeLiveBid(
            clock,
            bidder,
            Number(body.amount ?? clock.currentBid + clock.minIncrement),
          );

    if (body.mode === "absentee") {
      await supabase.from("absentee_bids").upsert(
        {
          lot_id: lotId,
          bidder_name: bidder,
          max_amount: Number(body.maxAmount),
        },
        { onConflict: "lot_id,bidder_name" },
      );
    }

    for (const event of result.events) {
      const { error } = await supabase.from("bids").insert({
        lot_id: lotId,
        bidder_name: event.bidder,
        bidder_id: event.bidder === bidder ? bidderId : null,
        bidder_email: event.bidder === bidder ? email : null,
        amount: event.amount,
        kind: event.kind,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    await supabase
      .from("lots")
      .update({
        current_bid: result.state.currentBid,
        high_bidder: result.state.highBidder,
        high_bidder_id: result.state.highBidder === bidder ? bidderId : null,
        ends_at: result.state.endsAt,
      })
      .eq("id", lotId);

    return NextResponse.json({
      currentBid: result.state.currentBid,
      endsAt: result.state.endsAt,
      highBidder: result.state.highBidder,
      events: result.events,
      extended: result.extended,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bid failed" },
      { status: 400 },
    );
  }
}
