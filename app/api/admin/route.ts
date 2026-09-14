import { NextRequest, NextResponse } from "next/server";
import { addDemoLot, getAdminDemo, seedDemoLots, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot, registerDemoLot } from "@/lib/demoAuctionStore";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { suggestAuctionNumber, sortLotsByNumber } from "@/lib/catalogNumbers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapConsignment, mapLot, type ConsignmentRow, type LotRow } from "@/lib/mappers";
import { parseListingGrade, withListedGrade } from "@/lib/listingGrade";
import { buildPayoutItems, buildPayoutReport } from "@/lib/payouts";
import type { AuctionEvent, AuctionLot, ConsignmentStatus, LotCategory, LotStatus } from "@/lib/utils";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { uniqueConsignorNames } from "@/lib/consignors";
import { uniqueImageUrls } from "@/lib/utils";
import { startingBidFromBuyNow } from "@/lib/buyNow";
import {
  allocateLotNumber,
  normalizeHouseSettings,
  readHouseDeskSettings,
  settingsAfterUsingLot,
  writeHouseDeskSettings,
  type HouseDeskSettings,
} from "@/lib/houseDesk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80";

function lotPhotos(urls?: string[]) {
  const images = uniqueImageUrls([...(urls ?? []), FALLBACK_IMAGE]);
  return { image: images[0], images };
}

function asEventUuid(value?: string) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

function isMissingColumn(error: { message?: string } | null, column: string) {
  return Boolean(error?.message && new RegExp(column, "i").test(error.message));
}

function isUniqueConflict(error: { message?: string } | null) {
  return Boolean(
    error?.message && /duplicate|unique|already exists/i.test(error.message),
  );
}

async function listLotNumbers(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | null,
  fallback: Array<{ lotNumber?: string | null }>,
) {
  if (!supabase) return fallback;
  const { data } = await supabase.from("lots").select("lot_number");
  const rows = (data ?? []).map((row) => ({ lotNumber: row.lot_number as string | null }));
  return rows.length ? rows : fallback;
}

async function currentHouseSettings(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | null,
  existing: Array<{ lotNumber?: string | null }>,
  demo: ReturnType<typeof getAdminDemo>,
): Promise<HouseDeskSettings> {
  if (supabase) return readHouseDeskSettings(supabase, existing);
  return normalizeHouseSettings(demo.houseSettings, existing);
}

async function persistHouseSettings(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | null,
  demo: ReturnType<typeof getAdminDemo>,
  settings: HouseDeskSettings,
) {
  demo.houseSettings = settings;
  if (supabase) await writeHouseDeskSettings(supabase, settings);
}

async function allocateFromHouse(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | null,
  demo: ReturnType<typeof getAdminDemo>,
  requested?: string,
) {
  const existing = await listLotNumbers(supabase, demo.inventory);
  const settings = await currentHouseSettings(supabase, existing, demo);
  const lotNumber = allocateLotNumber(requested, settings, existing);
  return { lotNumber, settings, existing };
}

async function commitHouseLot(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | null,
  demo: ReturnType<typeof getAdminDemo>,
  settings: HouseDeskSettings,
  usedLotNumber: string,
  existing: Array<{ lotNumber?: string | null }>,
) {
  const next = settingsAfterUsingLot(settings, usedLotNumber, [...existing, { lotNumber: usedLotNumber }]);
  await persistHouseSettings(supabase, demo, next);
  return next;
}

function withHouseSettings<T extends Record<string, unknown>>(
  payload: T,
  demo: ReturnType<typeof getAdminDemo>,
  houseSettings?: HouseDeskSettings,
) {
  const settings = houseSettings ?? demo.houseSettings;
  return {
    ...payload,
    houseSettings: settings,
    suggestedLotNumber: settings.nextLotNumber,
  };
}

async function insertLotRow(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  insertRow: Record<string, unknown>,
) {
  let { data, error } = await supabase.from("lots").insert(insertRow).select("*").single();
  if (isMissingColumn(error, "image_urls")) {
    const { image_urls: _unused, ...rest } = insertRow;
    ({ data, error } = await supabase.from("lots").insert(rest).select("*").single());
  }
  if (isMissingColumn(error, "reserve_price")) {
    const { reserve_price: _reserve, ...rest } = insertRow;
    ({ data, error } = await supabase.from("lots").insert(rest).select("*").single());
  }
  if (isMissingColumn(error, "buy_now_price")) {
    const { buy_now_price: _buyNow, ...rest } = insertRow;
    ({ data, error } = await supabase.from("lots").insert(rest).select("*").single());
  }
  if (isMissingColumn(error, "consignment_id")) {
    const { consignment_id: _cid, ...rest } = insertRow;
    ({ data, error } = await supabase.from("lots").insert(rest).select("*").single());
  }
  if (isMissingColumn(error, "listing_grade")) {
    const { listing_grade: _g, ...rest } = insertRow;
    ({ data, error } = await supabase.from("lots").insert(rest).select("*").single());
  }
  if (isMissingColumn(error, "item_details")) {
    const { item_details: _d, ...rest } = insertRow;
    ({ data, error } = await supabase.from("lots").insert(rest).select("*").single());
  }
  if (isUniqueConflict(error)) {
    const suffix = crypto.randomUUID().slice(0, 8);
    ({ data, error } = await supabase
      .from("lots")
      .insert({
        ...insertRow,
        slug: `${String(insertRow.slug ?? "lot")}-${suffix}`,
        lot_number: `${String(insertRow.lot_number ?? "LOT")}-${suffix}`,
      })
      .select("*")
      .single());
  }
  return { data, error };
}

function reviewQueue<T extends { status: string }>(items: T[]) {
  return items.filter((item) => item.status === "pending" || item.status === "held");
}

function databaseError(message?: string) {
  if (/invalid api key/i.test(message ?? "")) {
    return "The server cannot reach Supabase (invalid API key). In Vercel → Settings → Environment Variables, set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY to the same values as .env.local, then redeploy.";
  }
  return message || "Could not load admin data.";
}

function payloadFromDemo() {
  const demo = getAdminDemo();
  stampAuctionNumbers(demo);
  return {
    source: "demo" as const,
    queue: reviewQueue(demo.queue),
    inventory: sortLotsByNumber(demo.inventory.filter((lot) => lot.status !== "removed")),
    events: demo.events,
    suggestedLotNumber: demo.houseSettings.nextLotNumber,
    houseSettings: demo.houseSettings,
    suggestedAuctionNumber: suggestAuctionNumber(demo.events),
    payouts: buildPayoutReport(demo.inventory),
    payoutItems: buildPayoutItems(demo.inventory),
    consignors: uniqueConsignorNames(demo.queue, demo.inventory),
  };
}

function mapEvent(row: {
  id: string;
  name: string;
  auction_number?: string | null;
  starts_at: string;
  ends_at: string;
  archived_at?: string | null;
}): AuctionEvent {
  return {
    id: row.id,
    name: row.name,
    auctionNumber: row.auction_number ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    archivedAt: row.archived_at ?? null,
  };
}

function lotHref(lot: AuctionLot) {
  return `/auctions/${lot.slug || lot.id}`;
}

function auctionLabel(event?: AuctionEvent | null, lot?: AuctionLot) {
  if (event) {
    return event.auctionNumber ? `${event.auctionNumber} · ${event.name}` : event.name;
  }
  if (lot?.auctionNumber) return `Auction ${lot.auctionNumber}`;
  return "DealFinder warehouse (schedule a sale)";
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

  if (queueRes.error) {
    return NextResponse.json({ error: databaseError(queueRes.error.message) }, { status: 500 });
  }
  if (lotsRes.error) {
    return NextResponse.json({ error: databaseError(lotsRes.error.message) }, { status: 500 });
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
  const mappedQueue = (queueRes.data as ConsignmentRow[]).map(mapConsignment);
  const houseSettings = await readHouseDeskSettings(supabase, inventory);

  return NextResponse.json({
    source: "supabase",
    queue: reviewQueue(mappedQueue),
    inventory: sortLotsByNumber(inventory),
    events,
    suggestedLotNumber: houseSettings.nextLotNumber,
    houseSettings,
    suggestedAuctionNumber: suggestAuctionNumber(events),
    payouts: buildPayoutReport(inventory),
    payoutItems: buildPayoutItems(inventory),
    consignors: uniqueConsignorNames(mappedQueue, inventory),
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
  archivedAt?: string | null;
  title?: string;
  description?: string;
  category?: LotCategory;
  consignorName?: string;
  startingBid?: number;
  reservePrice?: number;
  buyNowPrice?: number;
  currentBid?: number;
  commissionRate?: number;
  imageUrls?: string[];
  lotNumber?: string;
  defaultStartingBid?: number;
  nextLotNumber?: string;
  postLive?: boolean;
  listingGrade?: string;
  itemDetails?: string;
  status?: string;
  remove?: boolean;
  relist?: boolean;
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

  if (body.action === "saveHouseSettings") {
    const existing = await listLotNumbers(supabase, demo.inventory);
    const settings = normalizeHouseSettings(
      {
        defaultStartingBid: body.defaultStartingBid,
        nextLotNumber: body.nextLotNumber,
      },
      existing,
    );
    await persistHouseSettings(supabase, demo, settings);
    return NextResponse.json(withHouseSettings({ ok: true }, demo, settings));
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
    const starting = Number(body.startingBid) || 0;
    const buyNow = Number(body.buyNowPrice ?? body.reservePrice) || 0;
    const listingGrade = parseListingGrade(body.listingGrade);
    const itemDetails = String(body.itemDetails ?? "").trim();
    const description = withListedGrade(body.description ?? "", listingGrade);
    const event = body.eventId
      ? demo.events.find((row) => row.id === body.eventId)
      : undefined;
    const status: LotStatus = body.postLive ? "live" : "paused";
    const endsAt = event?.endsAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

    if (isSupabaseConfigured && supabase) {
      const claimed = await allocateFromHouse(supabase, demo, body.lotNumber);
      const lotNumber = claimed.lotNumber;
      let photos = body.imageUrls ?? [];
      try {
        photos = await persistPublicImageUrls(supabase, photos);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? `Could not save photos: ${err.message}`
                : "Could not save photos to storage.",
          },
          { status: 400 },
        );
      }
      const { image, images } = lotPhotos(photos);
      const eventId = asEventUuid(body.eventId);
      let eventEnds = endsAt;
      if (eventId) {
        const { data: dbEvent } = await supabase
          .from("auction_events")
          .select("*")
          .eq("id", eventId)
          .maybeSingle();
        if (dbEvent?.ends_at) eventEnds = dbEvent.ends_at;
      }
      const insertRow: Record<string, unknown> = {
          slug: lotNumber.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
          title,
          category: body.category ?? "Oddities",
          description,
          consignor_name: body.consignorName?.trim() || "House stock",
          image_url: image,
          image_urls: images,
          starting_bid: starting,
          current_bid: starting,
          reserve_price: buyNow || null,
          buy_now_price: buyNow || null,
          min_increment: 5,
          ends_at: eventEnds,
          status,
          event_id: eventId,
          lot_number: lotNumber,
          listing_grade: listingGrade,
          item_details: itemDetails || null,
        };
      const { data, error } = await insertLotRow(supabase, insertRow);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const houseSettings = await commitHouseLot(
        supabase,
        demo,
        claimed.settings,
        lotNumber,
        claimed.existing,
      );
      return NextResponse.json(withHouseSettings({ ok: true, lot: mapLot(data as LotRow) }, demo, houseSettings));
    }

    const claimed = await allocateFromHouse(null, demo, body.lotNumber);
    const lotNumber = claimed.lotNumber;
    const { image, images } = lotPhotos(body.imageUrls);

    const lot: AuctionLot = {
      id: crypto.randomUUID(),
      slug: lotNumber.toLowerCase(),
      title,
      category: body.category ?? "Oddities",
      image,
      images,
      currentBid: starting,
      minIncrement: 5,
      endsAt,
      consignor: body.consignorName?.trim() || "House stock",
      description,
      status,
      eventId: body.eventId || null,
      lotNumber,
      auctionNumber: event?.auctionNumber ?? null,
      startingBid: starting,
      reservePrice: buyNow || null,
      buyNowPrice: buyNow || null,
      listingGrade,
      itemDetails: itemDetails || null,
    };
    if (event && body.postLive) applyEventToLot(lot, event, true);
    addDemoLot(lot);
    const houseSettings = await commitHouseLot(null, demo, claimed.settings, lotNumber, claimed.existing);
    return NextResponse.json(withHouseSettings({ ok: true, lot }, demo, houseSettings));
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
      if (body.archivedAt !== undefined) event.archivedAt = body.archivedAt;
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
      if (body.archivedAt !== undefined) updates.archived_at = body.archivedAt;
      const { error } = await supabase.from("auction_events").update(updates).eq("id", body.id);
      if (error && /archived_at/i.test(error.message)) {
        delete updates.archived_at;
        const retry = await supabase.from("auction_events").update(updates).eq("id", body.id);
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
      } else if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
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
      if (body.buyNowPrice != null || body.reservePrice != null) {
        const buyNow = Number(body.buyNowPrice ?? body.reservePrice) || 0;
        item.buyNowPrice = buyNow;
        item.reservePrice = buyNow;
      }
      if (!item.startingBid && item.buyNowPrice) {
        item.startingBid = startingBidFromBuyNow(item.buyNowPrice);
      }
      if (body.consignorName != null) item.consignor = body.consignorName.trim();
      if (body.status) item.status = body.status as ConsignmentStatus;
      if (body.status === "approved") {
        const claimed = await allocateFromHouse(null, demo);
        const lotNumber = claimed.lotNumber;
        const event = body.eventId
          ? demo.events.find((row) => row.id === body.eventId)
          : undefined;
        const { image, images } = lotPhotos(item.imageUrls);
        const lot: AuctionLot = {
          id: `lot-${item.id}`,
          slug: lotNumber.toLowerCase(),
          title: item.title,
          category: item.category,
          image,
          images,
          currentBid: item.startingBid ?? 0,
          minIncrement: 5,
          endsAt: event?.endsAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          consignor: item.consignor,
          description: item.description ?? "",
          status: "paused",
          lotNumber,
          startingBid: item.startingBid ?? 0,
          reservePrice: item.buyNowPrice ?? item.reservePrice ?? null,
          buyNowPrice: item.buyNowPrice ?? item.reservePrice ?? null,
          listingGrade: item.listingGrade,
          itemDetails: item.notes ?? null,
        };
        if (event) applyEventToLot(lot, event);
        addDemoLot(lot);
        await commitHouseLot(null, demo, claimed.settings, lotNumber, claimed.existing);
        if (!isSupabaseConfigured || !supabase) {
          return NextResponse.json({
            ok: true,
            lot,
            href: "/live",
            auctionLabel: auctionLabel(event, lot),
            saleStartsAt: event?.startsAt ?? null,
            postedLive: lot.status === "live",
          });
        }
      }
    }

    if (isSupabaseConfigured && supabase) {
      const updates: Record<string, unknown> = {};
      if (body.title != null) updates.title = body.title;
      if (body.description != null) updates.description = body.description;
      if (body.startingBid != null) updates.starting_bid = body.startingBid;
      if (body.buyNowPrice != null || body.reservePrice != null) {
        const buyNow = Number(body.buyNowPrice ?? body.reservePrice) || 0;
        updates.reserve_price = buyNow || null;
        updates.buy_now_price = buyNow || null;
      }
      if (body.consignorName != null) updates.consignor_name = body.consignorName.trim();
      if (body.status) updates.status = body.status;
      let { data: consignment, error } = await supabase
        .from("consignments")
        .update(updates)
        .eq("id", body.id)
        .select("*")
        .single();
      if (isMissingColumn(error, "buy_now_price")) {
        const { buy_now_price: _buyNow, ...rest } = updates;
        ({ data: consignment, error } = await supabase
          .from("consignments")
          .update(rest)
          .eq("id", body.id)
          .select("*")
          .single());
      }
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (body.status === "approved" && consignment) {
        const row = consignment as ConsignmentRow;
        const reserve = Number(row.buy_now_price ?? row.reserve_price ?? 0);
        const starting =
          Number(row.starting_bid ?? row.estimated_low) ||
          (reserve ? startingBidFromBuyNow(reserve) : 0);
        let photos = row.image_urls ?? [];
        try {
          photos = await persistPublicImageUrls(supabase, photos);
        } catch (err) {
          return NextResponse.json(
            {
              error:
                err instanceof Error
                  ? `Approved the consignment, but photos failed: ${err.message}`
                  : "Could not save consignment photos.",
            },
            { status: 400 },
          );
        }
        const { image, images } = lotPhotos(photos);
        const { data: eventRows } = await supabase
          .from("auction_events")
          .select("*")
          .order("starts_at", { ascending: true });
        const mappedEvents = (eventRows ?? []).map(mapEvent);
        const event = body.eventId
          ? mappedEvents.find((row) => row.id === body.eventId)
          : undefined;
        const eventId = event ? asEventUuid(event.id) ?? event.id : null;
        const eventEnds =
          event?.endsAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
        const houseStatus: LotStatus = event
          ? new Date(event.startsAt).getTime() > Date.now()
            ? "paused"
            : "live"
          : "paused";
        const { data: existingRows, error: existingError } = await supabase
          .from("lots")
          .select("*")
          .eq("consignment_id", row.id)
          .limit(1);
        if (existingError && !isMissingColumn(existingError, "consignment_id")) {
          return NextResponse.json({ error: existingError.message }, { status: 400 });
        }
        if (existingRows?.length) {
          const lot = mapLot(existingRows[0] as LotRow);
          lot.auctionNumber = event?.auctionNumber ?? lot.auctionNumber;
          return NextResponse.json({
            ok: true,
            lot,
            href: "/live",
            auctionLabel: auctionLabel(event, lot),
            saleStartsAt: event?.startsAt ?? null,
            postedLive: lot.status === "live",
          });
        }
        const claimed = await allocateFromHouse(supabase, demo);
        const lotNumber = claimed.lotNumber;
        const insertRow: Record<string, unknown> = {
            consignment_id: row.id,
            slug: lotNumber.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
            title: row.title,
            category: row.category,
            description: row.description ?? "",
            consignor_name: row.consignor_name,
            image_url: image,
            image_urls: images,
            starting_bid: starting,
            current_bid: starting,
            reserve_price: reserve || null,
            buy_now_price: reserve || null,
            min_increment: 5,
            ends_at: eventEnds,
            status: houseStatus,
            event_id: eventId,
            lot_number: lotNumber,
            listing_grade: parseListingGrade(row.listing_grade ?? row.condition),
            item_details: String(row.notes ?? "").trim() || null,
          };
          const { data: lotRow, error: lotError } = await insertLotRow(supabase, insertRow);
          if (lotError || !lotRow) {
            return NextResponse.json(
              { error: lotError?.message || "Could not file this item into warehouse inventory." },
              { status: 400 },
            );
          }
          const lot = mapLot(lotRow as LotRow);
          lot.auctionNumber = event?.auctionNumber ?? lot.auctionNumber;
          lot.eventId = eventId ?? lot.eventId;
          await commitHouseLot(supabase, demo, claimed.settings, lotNumber, claimed.existing);
          return NextResponse.json({
            ok: true,
            lot,
            href: "/live",
            auctionLabel: auctionLabel(event, lot),
            saleStartsAt: event?.startsAt ?? null,
            postedLive: houseStatus === "live",
          });
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
    if (body.reservePrice != null || body.buyNowPrice != null) {
      const buyNow = Number(body.buyNowPrice ?? body.reservePrice) || 0;
      lot.reservePrice = buyNow || null;
      lot.buyNowPrice = buyNow || null;
    }
    if (body.lotNumber != null) lot.lotNumber = body.lotNumber.trim();
    if (body.category) lot.category = body.category;
    if (body.listingGrade) lot.listingGrade = parseListingGrade(body.listingGrade);
    if (body.itemDetails != null) lot.itemDetails = body.itemDetails;
    if (body.eventId) {
      const event = demo.events.find((row) => row.id === body.eventId);
      if (event) applyEventToLot(lot, event, body.status === "live");
    }
    if (body.relist) {
      lot.highBidder = null;
      lot.highBidderId = null;
      lot.currentBid = body.startingBid ?? lot.startingBid ?? lot.currentBid;
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
      if (body.reservePrice != null || body.buyNowPrice != null) {
        const buyNow = Number(body.buyNowPrice ?? body.reservePrice) || 0;
        updates.reserve_price = buyNow || null;
        updates.buy_now_price = buyNow || null;
      }
      if (body.lotNumber != null) updates.lot_number = body.lotNumber.trim();
      if (body.category) updates.category = body.category;
      if (body.listingGrade) updates.listing_grade = parseListingGrade(body.listingGrade);
      if (body.itemDetails != null) updates.item_details = body.itemDetails;
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
      if (body.relist) {
        updates.high_bidder = null;
        updates.high_bidder_id = null;
        if (body.startingBid != null) {
          updates.starting_bid = body.startingBid;
          updates.current_bid = body.startingBid;
        } else if (body.currentBid != null) {
          updates.current_bid = body.currentBid;
        }
      }
      if (Object.keys(updates).length) {
        let { error } = await supabase.from("lots").update(updates).eq("id", body.id);
        if (isMissingColumn(error, "buy_now_price")) {
          const { buy_now_price: _buyNow, ...rest } = updates;
          ({ error } = await supabase.from("lots").update(rest).eq("id", body.id));
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
