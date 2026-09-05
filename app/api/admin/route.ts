import { NextRequest, NextResponse } from "next/server";
import { addDemoLot, getAdminDemo, seedDemoLots, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot, registerDemoLot } from "@/lib/demoAuctionStore";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { suggestAuctionNumber, suggestLotNumber } from "@/lib/catalogNumbers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapConsignment, mapLot, type ConsignmentRow, type LotRow } from "@/lib/mappers";
import { buildPayoutItems, buildPayoutReport } from "@/lib/payouts";
import type { AuctionEvent, AuctionLot, ConsignmentStatus, LotCategory, LotStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80";

function payloadFromDemo() {
  const demo = getAdminDemo();
  stampAuctionNumbers(demo);
  return {
    source: "demo" as const,
    queue: demo.queue,
    inventory: demo.inventory.filter((lot) => lot.status !== "removed"),
    events: demo.events,
    suggestedLotNumber: suggestLotNumber(demo.inventory),
    suggestedAuctionNumber: suggestAuctionNumber(demo.events),
    payouts: buildPayoutReport(demo.inventory),
    payoutItems: buildPayoutItems(demo.inventory),
  };
}

function mapEvent(row: {
  id: string;
  name: string;
  auction_number?: string | null;
  starts_at: string;
  ends_at: string;
}): AuctionEvent {
  return {
    id: row.id,
    name: row.name,
    auctionNumber: row.auction_number ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json(payloadFromDemo());
  }

  const [queueRes, lotsRes, eventsRes] = await Promise.all([
    supabase.from("consignments").select("*").order("created_at", { ascending: false }),
    supabase.from("lots").select("*").order("ends_at", { ascending: true }),
    supabase.from("auction_events").select("*").order("starts_at", { ascending: true }),
  ]);

  if (queueRes.error || lotsRes.error) {
    return NextResponse.json(payloadFromDemo());
  }

  const events: AuctionEvent[] = (eventsRes.data ?? []).map(mapEvent);
  const numbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
  const inventory = (lotsRes.data as LotRow[])
    .map(mapLot)
    .filter((lot) => lot.status !== "removed")
    .map((lot) => ({
      ...lot,
      auctionNumber: lot.eventId ? numbers.get(lot.eventId) ?? lot.auctionNumber : lot.auctionNumber,
    }));

  return NextResponse.json({
    source: "supabase",
    queue: (queueRes.data as ConsignmentRow[]).map(mapConsignment),
    inventory,
    events,
    suggestedLotNumber: suggestLotNumber(inventory),
    suggestedAuctionNumber: suggestAuctionNumber(events),
    payouts: buildPayoutReport(inventory),
    payoutItems: buildPayoutItems(inventory),
  });
}

type AdminBody = {
  action?: string;
  entity?: "consignment" | "lot" | "event";
  id?: string;
  eventId?: string;
  name?: string;
  auctionNumber?: string;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  description?: string;
  category?: LotCategory;
  consignorName?: string;
  startingBid?: number;
  reservePrice?: number;
  currentBid?: number;
  commissionRate?: number;
  imageUrls?: string[];
  lotNumber?: string;
  postLive?: boolean;
  status?: string;
  remove?: boolean;
};

function applyEventToLot(lot: AuctionLot, event: AuctionEvent, forceLive?: boolean) {
  lot.eventId = event.id;
  lot.auctionNumber = event.auctionNumber ?? lot.auctionNumber;
  lot.endsAt = event.endsAt;
  if (forceLive) {
    lot.status = "live";
    return;
  }
  lot.status = new Date(event.startsAt).getTime() > Date.now() ? "paused" : "live";
}

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as AdminBody;
  const supabase = getSupabaseAdmin();
  const demo = getAdminDemo();

  if (body.action === "seed") {
    const seeded = seedDemoLots();
    return NextResponse.json({ ok: true, seeded });
  }

  if (body.action === "createEvent") {
    if (!body.name || !body.startsAt || !body.endsAt) {
      return NextResponse.json({ error: "Event name, start, and end are required." }, { status: 400 });
    }
    const auctionNumber = body.auctionNumber?.trim() || suggestAuctionNumber(demo.events);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("auction_events")
        .insert({
          name: body.name,
          auction_number: auctionNumber,
          starts_at: body.startsAt,
          ends_at: body.endsAt,
        })
        .select("*")
        .single();
      if (!error && data) {
        return NextResponse.json({ ok: true, event: mapEvent(data) });
      }
    }
    const event: AuctionEvent = {
      id: crypto.randomUUID(),
      name: body.name,
      auctionNumber,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
    };
    demo.events.unshift(event);
    return NextResponse.json({ ok: true, event });
  }

  if (body.action === "createLot") {
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    const lotNumber = body.lotNumber?.trim() || suggestLotNumber(demo.inventory);
    const starting = Number(body.startingBid) || 0;
    const image = body.imageUrls?.[0] || FALLBACK_IMAGE;
    const event = body.eventId
      ? demo.events.find((row) => row.id === body.eventId)
      : undefined;
    const status: LotStatus = body.postLive ? "live" : "paused";
    const endsAt = event?.endsAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

    if (isSupabaseConfigured && supabase) {
      let eventEnds = endsAt;
      if (body.eventId) {
        const { data: dbEvent } = await supabase
          .from("auction_events")
          .select("*")
          .eq("id", body.eventId)
          .maybeSingle();
        if (dbEvent?.ends_at) eventEnds = dbEvent.ends_at;
      }
      const { data, error } = await supabase
        .from("lots")
        .insert({
          slug: lotNumber.toLowerCase(),
          title,
          category: body.category ?? "Oddities",
          description: body.description ?? "",
          consignor_name: body.consignorName?.trim() || "House stock",
          image_url: image,
          starting_bid: starting,
          current_bid: starting,
          min_increment: 5,
          ends_at: eventEnds,
          status,
          event_id: body.eventId || null,
          lot_number: lotNumber,
        })
        .select("*")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, lot: mapLot(data as LotRow) });
    }

    const lot: AuctionLot = {
      id: crypto.randomUUID(),
      slug: lotNumber.toLowerCase(),
      title,
      category: body.category ?? "Oddities",
      image,
      currentBid: starting,
      minIncrement: 5,
      endsAt,
      consignor: body.consignorName?.trim() || "House stock",
      description: body.description ?? "",
      status,
      eventId: body.eventId || null,
      lotNumber,
      auctionNumber: event?.auctionNumber ?? null,
    };
    if (event && body.postLive) applyEventToLot(lot, event, true);
    addDemoLot(lot);
    return NextResponse.json({ ok: true, lot });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as AdminBody;
  const supabase = getSupabaseAdmin();
  const demo = getAdminDemo();

  if (body.entity === "event") {
    if (!body.id) return NextResponse.json({ error: "Event id required." }, { status: 400 });
    const event = demo.events.find((row) => row.id === body.id);
    if (event) {
      if (body.name != null) event.name = body.name;
      if (body.auctionNumber != null) event.auctionNumber = body.auctionNumber.trim();
      if (body.startsAt) event.startsAt = body.startsAt;
      if (body.endsAt) event.endsAt = body.endsAt;
      stampAuctionNumbers(demo);
      for (const lot of demo.inventory) {
        if (lot.eventId === event.id) {
          lot.endsAt = event.endsAt;
          lot.auctionNumber = event.auctionNumber;
        }
      }
    }
    if (isSupabaseConfigured && supabase) {
      const updates: Record<string, unknown> = {};
      if (body.name != null) updates.name = body.name;
      if (body.auctionNumber != null) updates.auction_number = body.auctionNumber.trim();
      if (body.startsAt) updates.starts_at = body.startsAt;
      if (body.endsAt) updates.ends_at = body.endsAt;
      const { error } = await supabase.from("auction_events").update(updates).eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (body.endsAt) {
        await supabase.from("lots").update({ ends_at: body.endsAt }).eq("event_id", body.id);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.entity === "consignment") {
    const item = demo.queue.find((row) => row.id === body.id);
    if (item) {
      if (body.title != null) item.title = body.title;
      if (body.description != null) item.description = body.description;
      if (body.startingBid != null) item.startingBid = body.startingBid;
      if (body.status) item.status = body.status as ConsignmentStatus;
      if (body.status === "approved") {
        const lotNumber = suggestLotNumber(demo.inventory);
        const lot: AuctionLot = {
          id: `lot-${item.id}`,
          slug: `lot-${item.id}`,
          title: item.title,
          category: item.category,
          image: item.imageUrls[0] || FALLBACK_IMAGE,
          currentBid: item.startingBid ?? 0,
          minIncrement: 5,
          endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          consignor: item.consignor,
          description: item.description ?? "",
          status: "paused",
          lotNumber,
        };
        addDemoLot(lot);
      }
    }

    if (isSupabaseConfigured && supabase) {
      const updates: Record<string, unknown> = {};
      if (body.title != null) updates.title = body.title;
      if (body.description != null) updates.description = body.description;
      if (body.startingBid != null) updates.starting_bid = body.startingBid;
      if (body.status) updates.status = body.status;
      const { data: consignment, error } = await supabase
        .from("consignments")
        .update(updates)
        .eq("id", body.id)
        .select("*")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (body.status === "approved" && consignment) {
        const row = consignment as ConsignmentRow;
        const starting = Number(row.starting_bid ?? row.estimated_low) || 0;
        const image = row.image_urls?.[0] || FALLBACK_IMAGE;
        const { data: existing } = await supabase
          .from("lots")
          .select("id")
          .eq("consignment_id", row.id)
          .maybeSingle();
        if (!existing) {
          await supabase.from("lots").insert({
            consignment_id: row.id,
            title: row.title,
            category: row.category,
            description: row.description ?? "",
            consignor_name: row.consignor_name,
            image_url: image,
            starting_bid: starting,
            current_bid: starting,
            min_increment: 5,
            ends_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
            status: "paused" satisfies LotStatus,
            lot_number: suggestLotNumber(demo.inventory),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  const lot = demo.inventory.find((row) => row.id === body.id);
  if (lot) {
    if (body.remove) lot.status = "removed";
    if (body.status) lot.status = body.status as LotStatus;
    if (body.title != null) lot.title = body.title;
    if (body.description != null) lot.description = body.description;
    if (body.currentBid != null) lot.currentBid = body.currentBid;
    if (body.startingBid != null) {
      lot.startingBid = body.startingBid;
      const clock = getDemoLot(lot.id);
      if (clock && clock.bids.length === 0) {
        clock.currentBid = body.startingBid;
        lot.currentBid = body.startingBid;
      }
    }
    if (body.reservePrice != null) lot.reservePrice = body.reservePrice;
    if (body.lotNumber != null) lot.lotNumber = body.lotNumber.trim();
    if (body.category) lot.category = body.category;
    if (body.eventId) {
      const event = demo.events.find((row) => row.id === body.eventId);
      if (event) applyEventToLot(lot, event, body.status === "live");
    }
    registerDemoLot(lot);
  }

  if (isSupabaseConfigured && supabase) {
    if (body.remove) {
      const { error } = await supabase.from("lots").update({ status: "removed" }).eq("id", body.id);
      if (error) {
        await supabase.from("lots").delete().eq("id", body.id);
      }
    } else {
      const updates: Record<string, unknown> = {};
      if (body.status) updates.status = body.status;
      if (body.title != null) updates.title = body.title;
      if (body.description != null) updates.description = body.description;
      if (body.currentBid != null) updates.current_bid = body.currentBid;
      if (body.startingBid != null) updates.starting_bid = body.startingBid;
      if (body.reservePrice != null) updates.reserve_price = body.reservePrice;
      if (body.lotNumber != null) updates.lot_number = body.lotNumber.trim();
      if (body.category) updates.category = body.category;
      if (body.eventId) {
        updates.event_id = body.eventId;
        const { data: event } = await supabase
          .from("auction_events")
          .select("*")
          .eq("id", body.eventId)
          .maybeSingle();
        if (event) {
          updates.ends_at = event.ends_at;
          if (body.status !== "live") {
            updates.status = new Date(event.starts_at).getTime() > Date.now() ? "paused" : "live";
          }
        }
      }
      if (Object.keys(updates).length) {
        await supabase.from("lots").update(updates).eq("id", body.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
