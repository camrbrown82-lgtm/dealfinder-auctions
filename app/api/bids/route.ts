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
import { isProfileComplete, type BidderProfile } from "@/lib/profileTypes";
import { loadBidderPayment } from "@/lib/helcim";
import { openUnsoldFloors, patchLotRow, weekFromNow } from "@/lib/openFloor";
import { recordSoldLotSettlement } from "@/lib/recordSale";
import { mapLot, type LotRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}


function pgMessage(error: { message?: string; details?: string; hint?: string } | null) {
  if (!error) return "";
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

async function writeLot(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  lotId: string,
  patch: Record<string, unknown>,
) {
  const attempts = [lotId];
  if (!isUuid(lotId)) {
    attempts.push(lotId.toLowerCase());
    if (!lotId.toUpperCase().startsWith("LOT-")) attempts.push(`LOT-${lotId}`);
  }
  if (isUuid(lotId)) {
    const rest = await patchLotRow(lotId, patch);
    if (rest.data?.[0]) return null;
    if (!rest.ok) return { message: rest.body || `HTTP ${rest.status}` };
  }
  let lastError: { message?: string; details?: string; hint?: string } | null = null;
  for (const key of attempts) {
    for (const column of ["id", "slug", "lot_number"] as const) {
      if (column === "id" && !isUuid(key)) continue;
      let { data, error } = await supabase.from("lots").update(patch).eq(column, key).select("id");
      if (error && /high_bidder_id/i.test(pgMessage(error))) {
        const next = { ...patch };
        delete next.high_bidder_id;
        ({ data, error } = await supabase.from("lots").update(next).eq(column, key).select("id"));
      }
      if (data?.[0]?.id) return null;
      lastError = error;
    }
  }
  if (isUuid(lotId)) {
    const rest = await patchLotRow(lotId, patch);
    if (rest.data?.[0]) return null;
    if (!rest.ok) return { message: rest.body || `HTTP ${rest.status}` };
  }
  return lastError ?? { message: "Could not update this lot." };
}

async function forceLotOpen(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  lotId: string,
) {
  const { data: row } = await supabase
    .from("lots")
    .select("id, event_id, ends_at")
    .eq("id", lotId)
    .maybeSingle();
  let endsAt = weekFromNow();
  if (row?.event_id) {
    const { data: event } = await supabase
      .from("auction_events")
      .select("ends_at")
      .eq("id", row.event_id)
      .maybeSingle();
    if (event?.ends_at && new Date(event.ends_at).getTime() > Date.now()) {
      endsAt = String(event.ends_at);
    }
  } else if (row?.ends_at && new Date(String(row.ends_at)).getTime() > Date.now()) {
    endsAt = String(row.ends_at);
  }
  const patch: Record<string, unknown> = {
    status: "live",
    ends_at: endsAt,
  };
  const rest = await patchLotRow(lotId, patch);
  if (!rest.ok || !rest.data?.length) {
    const error = await writeLot(supabase, lotId, patch);
    return { patch, error: pgMessage(error) || rest.body || null };
  }
  return { patch, error: null };
}

async function recordTape(
  _supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  _row: Record<string, unknown>,
) {
  // Bid tape insert is skipped: Postgres still rejects inserts unless the lot
  // row is already status=live. The hammer is stored on public.lots instead.
}

export async function GET(request: NextRequest) {
  const lotId = request.nextUrl.searchParams.get("lotId");
  if (!lotId) {
    return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    let resolvedId = lotId;
    if (!isUuid(lotId)) {
      const bySlug = await supabase.from("lots").select("id").eq("slug", lotId).limit(1).maybeSingle();
      if (bySlug.data?.id) resolvedId = String(bySlug.data.id);
    }
    const primary = await supabase
      .from("bids")
      .select("bidder_name, amount, kind, created_at")
      .eq("lot_id", resolvedId)
      .order("created_at", { ascending: false })
      .limit(12);
    const fallback =
      primary.error && /kind/i.test(primary.error.message)
        ? await supabase
            .from("bids")
            .select("bidder_name, amount, created_at")
            .eq("lot_id", resolvedId)
            .order("created_at", { ascending: false })
            .limit(12)
        : primary;
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 400 });
    }
    return NextResponse.json({
      bids: (fallback.data ?? []).map((row: { bidder_name?: string; amount?: number; kind?: string }) => ({
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
  const payment = await loadBidderPayment(session.id);
  if (payment.preauthStatus !== "held") {
    return NextResponse.json(
      {
        error: "Authorize the $50 bidding hold before placing a paddle.",
        code: "PREAUTH_REQUIRED",
      },
      { status: 402 },
    );
  }

  const body = (await request.json()) as {
    lotId?: string;
    mode?: "live" | "absentee" | "buy_now";
    amount?: number;
    maxAmount?: number;
  };

  const lotId = body.lotId?.trim();
  if (!lotId) {
    return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    return persistSupabase(supabase, lotId, session, body);
  }

  return persistDemo(lotId, session, body);
}

async function persistDemo(
  lotId: string,
  session: BidderProfile,
  body: { mode?: "live" | "absentee" | "buy_now"; amount?: number; maxAmount?: number },
) {
  const bidder = session.fullName || session.email;
  const bidderId = session.id;
  const email = session.email;
  const demo = getDemoLot(lotId);
  if (!demo) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }
  if (demo.status === "removed") {
    return NextResponse.json({ error: "This lot was removed from the sale." }, { status: 400 });
  }
  if (demo.status === "ended" && (demo.highBidder || demo.highBidderId)) {
    return NextResponse.json({ error: "This lot is already sold." }, { status: 400 });
  }
  demo.status = "live";
  demo.endsAt = weekFromNow();

  if (body.mode === "buy_now") {
    const catalog = getAdminDemo().inventory.find((row) => row.id === lotId || row.slug === lotId);
    const amount = Number(catalog?.buyNowPrice ?? body.amount);
    if (!amount || amount < demo.currentBid) {
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
      await recordSoldLotSettlement(inventory, session, inventory.auctionNumber);
    }
    return NextResponse.json({
      currentBid: demo.currentBid,
      endsAt: demo.endsAt,
      highBidder: demo.highBidder,
      highBidderId: demo.highBidderId,
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
      highBidderId: demo.highBidderId,
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
  session: BidderProfile,
  body: { mode?: "live" | "absentee" | "buy_now"; amount?: number; maxAmount?: number },
) {
  const bidder = session.fullName || session.email;
  const bidderId = session.id;
  const email = session.email;
  await openUnsoldFloors(supabase);
  let { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot && !isUuid(lotId)) {
    const bySlug = await supabase.from("lots").select("*").eq("slug", lotId).limit(1).maybeSingle();
    lot = bySlug.data;
    lotError = bySlug.error;
  }
  if (!lot) {
    const numbers = [lotId];
    if (!/^LOT-/i.test(lotId)) numbers.push(`LOT-${lotId}`);
    else numbers.push(lotId.replace(/^LOT-/i, ""));
    for (const number of numbers) {
      const byNumber = await supabase.from("lots").select("*").eq("lot_number", number).limit(1).maybeSingle();
      if (byNumber.data) {
        lot = byNumber.data;
        lotError = byNumber.error;
        break;
      }
    }
  }
  if (lotError || !lot) {
    return NextResponse.json({ error: lotError?.message || "Lot not found" }, { status: 404 });
  }
  const resolvedId = String(lot.id);
  if (lot.status === "removed") {
    return NextResponse.json({ error: "This lot was removed from the sale." }, { status: 400 });
  }
  if (lot.status === "ended" && (lot.high_bidder || lot.high_bidder_id)) {
    return NextResponse.json({ error: "This lot is already sold." }, { status: 400 });
  }
  const opened = await forceLotOpen(supabase, resolvedId);
  Object.assign(lot, opened.patch);

  const { data: absenteeRows } = await supabase
    .from("absentee_bids")
    .select("bidder_name, max_amount")
    .eq("lot_id", resolvedId);

  const clock: AuctionClock = {
    currentBid: Number(lot.current_bid),
    minIncrement: Number(lot.min_increment) || 5,
    endsAt: String(lot.ends_at ?? opened.patch.ends_at),
    highBidder: (lot.high_bidder as string | null) ?? null,
    absentees: (absenteeRows ?? []).map((row) => ({
      bidder: row.bidder_name,
      max: Number(row.max_amount),
    })),
  };

  try {
    if (body.mode === "buy_now") {
      const listed = Number(lot.buy_now_price ?? lot.reserve_price ?? 0);
      const buyNow = listed > 0 ? listed : Number(body.amount) || 0;
      if (!buyNow) {
        return NextResponse.json({ error: "This lot has no buy now price." }, { status: 400 });
      }
      const endedAt = new Date().toISOString();
      const closePatch: Record<string, unknown> = {
        current_bid: buyNow,
        high_bidder: bidder,
        high_bidder_id: bidderId,
        status: "ended",
        ends_at: endedAt,
      };
      let closed = await patchLotRow(resolvedId, closePatch);
      if (!closed.ok || !closed.data?.length) {
        const { high_bidder_id: _id, ...withoutBidderId } = closePatch;
        closed = await patchLotRow(resolvedId, withoutBidderId);
      }
      if (!closed.ok || !closed.data?.length) {
        const closeError = await writeLot(supabase, resolvedId, closePatch);
        if (closeError) {
          return NextResponse.json({ error: pgMessage(closeError) }, { status: 400 });
        }
      }
      void recordTape(supabase, {
        lot_id: resolvedId,
        bidder_name: bidder,
        bidder_id: bidderId,
        bidder_email: email,
        amount: buyNow,
        kind: "live",
      });
      const sold = mapLot({ ...lot, current_bid: buyNow, high_bidder: bidder, high_bidder_id: bidderId, status: "ended" } as LotRow);
      if (sold.eventId) {
        const { data: event } = await supabase
          .from("auction_events")
          .select("auction_number")
          .eq("id", sold.eventId)
          .maybeSingle();
        sold.auctionNumber = event?.auction_number ?? sold.auctionNumber;
      }
      await recordSoldLotSettlement(sold, session, sold.auctionNumber);
      return NextResponse.json({
        currentBid: buyNow,
        endsAt: endedAt,
        highBidder: bidder,
        highBidderId: bidderId,
        events: [{ bidder, amount: buyNow, kind: "live" }],
        extended: false,
        boughtNow: true,
        status: "ended",
        floor: "always-open",
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
          lot_id: resolvedId,
          bidder_name: bidder,
          max_amount: Number(body.maxAmount),
        },
        { onConflict: "lot_id,bidder_name" },
      );
    }

    const persistError = await writeLot(supabase, resolvedId, {
      current_bid: result.state.currentBid,
      high_bidder: result.state.highBidder,
      high_bidder_id: result.state.highBidder === bidder ? bidderId : null,
      status: "live",
      ends_at: result.state.endsAt,
    });
    if (persistError) {
      return NextResponse.json({ error: pgMessage(persistError) }, { status: 400 });
    }

    for (const event of result.events) {
      void recordTape(supabase, {
        lot_id: resolvedId,
        bidder_name: event.bidder,
        bidder_id: event.bidder === bidder ? bidderId : null,
        bidder_email: event.bidder === bidder ? email : null,
        amount: event.amount,
        kind: event.kind,
      });
    }

    return NextResponse.json({
      currentBid: result.state.currentBid,
      endsAt: result.state.endsAt,
      highBidder: result.state.highBidder,
      highBidderId: result.state.highBidder === bidder ? bidderId : null,
      events: result.events,
      extended: result.extended,
      floor: "always-open",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bid failed" },
      { status: 400 },
    );
  }
}
