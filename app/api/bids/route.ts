import { NextRequest, NextResponse } from "next/server";
import { getBidderSession, bidderUnauthorized } from "@/lib/bidderAuth";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { nextLiveAmount, placeAbsenteeMax, placeLiveBid, type AuctionClock } from "@/lib/bidding";
import { structuredIncrement } from "@/lib/bidIncrements";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { isProfileComplete, type BidderProfile } from "@/lib/profileTypes";
import { patchLotRow } from "@/lib/openFloor";
import { recordSoldLotSettlement } from "@/lib/recordSale";
import { notifyOutbid } from "@/lib/notifyOutbid";
import { mapLot, type LotRow } from "@/lib/mappers";
import { evaluateBidAuth } from "@/lib/auctionRegistrations";
import { assertBuyNowLimit } from "@/lib/pendingInvoices";

export const dynamic = "force-dynamic";

function bidAuthResponse(auth: Awaited<ReturnType<typeof evaluateBidAuth>>) {
  return NextResponse.json(
    {
      error: auth.error,
      code: auth.code,
      authStatus: auth.authStatus,
      authorized: auth.authorized,
      registered: auth.registered,
    },
    { status: auth.code === "CASH_PENDING" ? 403 : 402 },
  );
}

async function requireBidAuthorization(userId: string, eventId: string | null | undefined) {
  const auth = await evaluateBidAuth(userId, eventId);
  if (!auth.ok) return bidAuthResponse(auth);
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}


function pgMessage(error: { message?: string; details?: string; hint?: string } | null) {
  if (!error) return "";
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

async function resolveSingleLotId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  lotId: string,
) {
  if (isUuid(lotId)) return lotId;
  const bySlug = await supabase.from("lots").select("id").eq("slug", lotId).limit(1).maybeSingle();
  if (bySlug.data?.id) return String(bySlug.data.id);
  const numbers = [lotId];
  if (!/^LOT-/i.test(lotId)) numbers.push(`LOT-${lotId}`);
  else numbers.push(lotId.replace(/^LOT-/i, ""));
  for (const number of numbers) {
    const byNumber = await supabase.from("lots").select("id").eq("lot_number", number).limit(1).maybeSingle();
    if (byNumber.data?.id) return String(byNumber.data.id);
  }
  return null;
}

async function writeLot(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  lotId: string,
  patch: Record<string, unknown>,
) {
  const id = await resolveSingleLotId(supabase, lotId);
  if (!id) return { message: "Could not update this lot." };
  const rest = await patchLotRow(id, patch);
  if (rest.data?.[0]) return null;
  let nextPatch = patch;
  if (!rest.ok && /high_bidder_id/i.test(rest.body || "")) {
    nextPatch = { ...patch };
    delete nextPatch.high_bidder_id;
    const retry = await patchLotRow(id, nextPatch);
    if (retry.data?.[0]) return null;
  }
  let { data, error } = await supabase.from("lots").update(nextPatch).eq("id", id).select("id");
  if (error && /high_bidder_id/i.test(pgMessage(error))) {
    const withoutBidder = { ...nextPatch };
    delete withoutBidder.high_bidder_id;
    ({ data, error } = await supabase.from("lots").update(withoutBidder).eq("id", id).select("id"));
  }
  if (data?.[0]?.id) return null;
  return error ?? { message: rest.body || "Could not update this lot." };
}

async function recordTape(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  row: Record<string, unknown>,
) {
  const payload = {
    lot_id: row.lot_id,
    bidder_name: row.bidder_name,
    bidder_id: row.bidder_id,
    bidder_email: row.bidder_email,
    amount: row.amount,
    kind: row.kind ?? "live",
  };
  let { error } = await supabase.from("bids").insert(payload);
  if (error && /bidder_email|bidder_id|kind/i.test(error.message)) {
    ({ error } = await supabase.from("bids").insert({
      lot_id: payload.lot_id,
      bidder_name: payload.bidder_name,
      amount: payload.amount,
    }));
  }
  return error;
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
  if (body.mode === "buy_now") {
    return NextResponse.json(
      { error: "Buy now is only available on the Buy Now page." },
      { status: 400 },
    );
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
  const catalog = getAdminDemo().inventory.find((row) => row.id === lotId || row.slug === lotId);
  const blocked = await requireBidAuthorization(session.id, catalog?.eventId ?? null);
  if (blocked) return blocked;
  if (demo.status === "removed") {
    return NextResponse.json({ error: "This lot was removed from the sale." }, { status: 400 });
  }
  if (demo.status === "ended") {
    return NextResponse.json({ error: "This lot is closed. Relist it from auction inventory to sell it again." }, { status: 400 });
  }
  if (new Date(demo.endsAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This auction has ended. Lots are view only until they are relisted." }, { status: 400 });
  }
  const catalogEvent = catalog?.eventId
    ? getAdminDemo().events.find((row) => row.id === catalog.eventId)
    : null;
  if (catalogEvent && new Date(catalogEvent.endsAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This auction has ended. Lots are view only until they are relisted." }, { status: 400 });
  }
  const previousBidderId = demo.highBidderId;
  const previousBidderName = demo.highBidder;

  if (body.mode === "buy_now") {
    const catalog = getAdminDemo().inventory.find((row) => row.id === lotId || row.slug === lotId);
    const amount = Number(catalog?.buyNowPrice ?? body.amount);
    if (!amount || amount < demo.currentBid) {
      return NextResponse.json({ error: "Buy now is no longer available on this lot." }, { status: 400 });
    }
    const limitError = await assertBuyNowLimit({
      session,
      eventId: catalog?.eventId ?? null,
      amount,
    });
    if (limitError) {
      return NextResponse.json({ error: limitError, code: "BUY_NOW_LIMIT" }, { status: 403 });
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
      await recordSoldLotSettlement(inventory, session, inventory.auctionNumber, "buy_now");
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
    minIncrement: structuredIncrement(demo.currentBid),
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
            Number(body.amount ?? nextLiveAmount(demo.currentBid, undefined, demo.highBidder)),
          );

    demo.currentBid = result.state.currentBid;
    demo.minIncrement = structuredIncrement(result.state.currentBid);
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
    void notifyOutbid({
      previousBidderId,
      previousBidderName,
      nextBidderId: demo.highBidderId,
      title: catalog?.title || "Lot",
      currentBid: demo.currentBid,
      lotId,
      slug: catalog?.slug,
    });

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
  const blocked = await requireBidAuthorization(session.id, (lot.event_id as string | null) ?? null);
  if (blocked) return blocked;
  const resolvedId = String(lot.id);
  if (lot.status === "removed") {
    return NextResponse.json({ error: "This lot was removed from the sale." }, { status: 400 });
  }
  if (lot.status === "ended") {
    return NextResponse.json(
      { error: "This lot is closed. Relist it from auction inventory to sell it again." },
      { status: 400 },
    );
  }
  if (lot.event_id) {
    const { data: event } = await supabase
      .from("auction_events")
      .select("starts_at, ends_at")
      .eq("id", lot.event_id)
      .maybeSingle();
    const now = Date.now();
    if (event?.ends_at && new Date(String(event.ends_at)).getTime() <= now) {
      return NextResponse.json(
        { error: "This auction has ended. Lots are view only until they are relisted." },
        { status: 400 },
      );
    }
  } else if (lot.ends_at && new Date(String(lot.ends_at)).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "This auction has ended. Lots are view only until they are relisted." },
      { status: 400 },
    );
  }
  const previousBidderId = (lot.high_bidder_id as string | null) ?? null;
  const previousBidderName = (lot.high_bidder as string | null) ?? null;

  const { data: absenteeRows } = await supabase
    .from("absentee_bids")
    .select("bidder_name, max_amount")
    .eq("lot_id", resolvedId);

  const clock: AuctionClock = {
    currentBid: Number(lot.current_bid),
    minIncrement: structuredIncrement(Number(lot.current_bid)),
    endsAt: String(lot.ends_at ?? ""),
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
      const limitError = await assertBuyNowLimit({
        session,
        eventId: (lot.event_id as string | null) ?? null,
        amount: buyNow,
      });
      if (limitError) {
        return NextResponse.json({ error: limitError, code: "BUY_NOW_LIMIT" }, { status: 403 });
      }
      const endedAt = new Date().toISOString();
      const closePatch: Record<string, unknown> = {
        current_bid: buyNow,
        high_bidder: bidder,
        high_bidder_id: bidderId,
        status: "ended",
        ends_at: endedAt,
        sale_source: "buy_now",
      };
      let closed = await patchLotRow(resolvedId, closePatch);
      if (!closed.ok || !closed.data?.length) {
        const { sale_source: _source, high_bidder_id: _id, ...withoutExtra } = closePatch;
        closed = await patchLotRow(resolvedId, withoutExtra);
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
      const sold = mapLot({ ...lot, current_bid: buyNow, high_bidder: bidder, high_bidder_id: bidderId, status: "ended", sale_source: "buy_now" } as LotRow);
      if (sold.eventId) {
        const { data: event } = await supabase
          .from("auction_events")
          .select("auction_number")
          .eq("id", sold.eventId)
          .maybeSingle();
        sold.auctionNumber = event?.auction_number ?? sold.auctionNumber;
      }
      sold.saleSource = "buy_now";
      await recordSoldLotSettlement(sold, session, sold.auctionNumber, "buy_now");
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
            Number(body.amount ?? nextLiveAmount(clock.currentBid, undefined, clock.highBidder)),
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

    for (const event of result.events) {
      await recordTape(supabase, {
        lot_id: resolvedId,
        bidder_name: event.bidder,
        bidder_id: event.bidder === bidder ? bidderId : null,
        bidder_email: event.bidder === bidder ? email : null,
        amount: event.amount,
        kind: event.kind,
      });
    }

    const persistError = await writeLot(supabase, resolvedId, {
      current_bid: result.state.currentBid,
      min_increment: structuredIncrement(result.state.currentBid),
      high_bidder: result.state.highBidder,
      high_bidder_id: result.state.highBidder === bidder ? bidderId : null,
      status: "live",
      ends_at: result.state.endsAt,
    });
    if (persistError) {
      return NextResponse.json({ error: pgMessage(persistError) }, { status: 400 });
    }

    void notifyOutbid({
      previousBidderId,
      previousBidderName,
      nextBidderId: result.state.highBidder === bidder ? bidderId : null,
      title: String(lot.title ?? "Lot"),
      currentBid: result.state.currentBid,
      lotId: resolvedId,
      slug: lot.slug ? String(lot.slug) : null,
    });

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
