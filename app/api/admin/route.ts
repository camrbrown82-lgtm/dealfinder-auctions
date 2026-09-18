import { NextRequest, NextResponse } from "next/server";
import { addDemoLot, getAdminDemo, seedDemoLots, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { getDemoLot, registerDemoLot, unregisterDemoLot } from "@/lib/demoAuctionStore";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import {
  formatLotNumber,
  nextFreeLotNumber,
  parseLotRangeStart,
  parseLotSeq,
  suggestAuctionNumber,
  sortLotsByNumber,
} from "@/lib/catalogNumbers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapConsignment, mapLot, type ConsignmentRow, type LotRow } from "@/lib/mappers";
import { parseListingGrade, withListedGrade } from "@/lib/listingGrade";
import { buildPayoutItems, buildPayoutReport } from "@/lib/payouts";
import type { AuctionEvent, AuctionLot, ConsignmentStatus, LotCategory, LotStatus } from "@/lib/utils";
import { auctionTermsColumns, mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { persistPublicImageUrls } from "@/lib/consignmentStorage";
import { uniqueConsignorNames } from "@/lib/consignors";
import { uniqueImageUrls } from "@/lib/utils";
import { startingBidFromBuyNow } from "@/lib/buyNow";
import { patchLotRow } from "@/lib/openFloor";
import { recordSoldLotSettlement } from "@/lib/recordSale";
import { attachLotToSale, ensureWeeklySales, firstWeeklyEvent, isWeeklySale, nextWeeklySale } from "@/lib/weeklySales";
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

function reviewQueue<T extends { id: string; status: string }>(
  items: T[],
  inventory: Array<{ consignmentId?: string | null }>,
) {
  const posted = new Set(
    inventory.map((lot) => lot.consignmentId).filter((id): id is string => Boolean(id)),
  );
  return items.filter((item) => {
    if (item.status === "pending" || item.status === "held") return true;
    if (item.status === "approved" && !posted.has(item.id)) return true;
    return false;
  });
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
    queue: reviewQueue(demo.queue, demo.inventory),
    inventory: sortLotsByNumber(demo.inventory.filter((lot) => lot.status !== "draft")),
    events: demo.events,
    suggestedLotNumber: demo.houseSettings.nextLotNumber,
    houseSettings: demo.houseSettings,
    suggestedAuctionNumber: suggestAuctionNumber(demo.events),
    payouts: buildPayoutReport(demo.inventory),
    payoutItems: buildPayoutItems(demo.inventory),
    consignors: uniqueConsignorNames(demo.queue, demo.inventory),
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

async function resolveSaleEvent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | null,
  demo: ReturnType<typeof getAdminDemo>,
  eventId?: string,
) {
  if (isSupabaseConfigured && supabase) {
    const events = await ensureWeeklySales(supabase);
    if (eventId) {
      const match = events.find((row) => row.id === eventId || row.auctionNumber === eventId);
      if (match) return match;
    }
    return firstWeeklyEvent(events.filter((row) => isWeeklySale(row))) ?? nextWeeklySale(events);
  }
  if (eventId) {
    const match = demo.events.find((row) => row.id === eventId);
    if (match) return match;
  }
  return firstWeeklyEvent(demo.events) ?? nextWeeklySale(demo.events);
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json(payloadFromDemo());
  }

  if (isSupabaseConfigured && supabase) {
    await ensureWeeklySales(supabase).catch((error) => {
      console.error("ensureWeeklySales", error instanceof Error ? error.message : error);
    });
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

  const events: AuctionEvent[] = (eventsRes.data ?? []).map((row) =>
    mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]),
  );
  const numbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
  const inventory = (lotsRes.data as LotRow[])
    .map(mapLot)
    .filter((lot) => lot.status !== "draft")
    .map((lot) => ({
      ...lot,
      auctionNumber: lot.eventId ? numbers.get(lot.eventId) ?? lot.auctionNumber : lot.auctionNumber,
    }));
  const mappedQueue = (queueRes.data as ConsignmentRow[]).map(mapConsignment);
  const houseSettings = await readHouseDeskSettings(supabase, inventory);

  return NextResponse.json({
    source: "supabase",
    queue: reviewQueue(mappedQueue, inventory),
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
  tcTemplateType?: string;
  termsAndConditions?: string;
  status?: string;
  remove?: boolean;
  relist?: boolean;
  lotIds?: string[];
  lotStart?: string | number;
  purgeTestData?: boolean;
};

function collectLotIds(body: AdminBody) {
  const ids = new Set<string>();
  for (const value of body.lotIds ?? []) {
    const id = String(value ?? "").trim();
    if (id) ids.add(id);
  }
  if (body.id?.trim()) ids.add(body.id.trim());
  return Array.from(ids);
}

async function unlinkLotBids(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  lotIds: string[],
) {
  if (!lotIds.length) return;
  await supabase.from("bids").delete().in("lot_id", lotIds);
  await supabase.from("absentee_bids").delete().in("lot_id", lotIds);
}

function applyEventToLot(lot: AuctionLot, event: AuctionEvent, forceLive?: boolean) {
  lot.eventId = event.id;
  lot.auctionNumber = event.auctionNumber ?? lot.auctionNumber;
  lot.endsAt = event.endsAt;
  lot.status = "live";
  if (!forceLive && new Date(event.endsAt).getTime() <= Date.now()) {
    lot.endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
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

  if (body.action === "purge-test-data") {
    const removed: Record<string, number> = {};
    if (isSupabaseConfigured && supabase) {
      const tables = [
        "bids",
        "absentee_bids",
        "auction_registrations",
        "lots",
        "consignments",
        "auction_events",
        "settlement_invoices",
        "settlement_archives",
        "helcim_sessions",
        "helcim_transactions",
        "profiles",
      ];
      for (const table of tables) {
        const { data: rows } = await supabase.from(table).select("*");
        const ids = (rows ?? []).map((row) => row.id ?? row.checkout_token ?? row.invoice_number).filter(Boolean);
        if (ids.length && rows?.[0] && "id" in (rows[0] as object)) {
          await supabase.from(table).delete().in("id", ids);
        } else if (table === "helcim_sessions" && ids.length) {
          await supabase.from(table).delete().in("checkout_token", ids);
        } else if (ids.length) {
          await supabase.from(table).delete().in("invoice_number", ids);
        }
        const leftover = await supabase.from(table).select("*");
        removed[table] = leftover.data?.length ?? leftover.error?.message?.length ?? 0;
      }
      const listed = await supabase.auth.admin.listUsers({ perPage: 200 });
      for (const user of listed.data?.users ?? []) {
        await supabase.auth.admin.deleteUser(user.id);
      }
      await supabase.from("house_desk_settings").update({ next_lot_seq: 1 }).eq("id", 1);
    }
    const demoStore = getAdminDemo();
    demoStore.inventory = [];
    demoStore.queue = [];
    demoStore.events = [];
    return NextResponse.json({ ok: true, remaining: removed, source: isSupabaseConfigured ? "supabase" : "demo" });
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
    const termsCols = auctionTermsColumns({
      tcTemplateType: body.tcTemplateType,
      termsAndConditions: body.termsAndConditions,
    });
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("auction_events")
        .insert({
          name: body.name,
          auction_number: auctionNumber,
          starts_at: body.startsAt,
          ends_at: body.endsAt,
          ...termsCols,
        })
        .select("*")
        .single();
      if (error || !data) {
        const { data: retry, error: retryError } = await supabase
          .from("auction_events")
          .insert({
            name: body.name,
            auction_number: auctionNumber,
            starts_at: body.startsAt,
            ends_at: body.endsAt,
          })
          .select("*")
          .single();
        if (retryError || !retry) {
          return NextResponse.json(
            { error: error?.message || retryError?.message || "Could not create that sale week." },
            { status: 400 },
          );
        }
        return NextResponse.json({ ok: true, event: mapAuctionEvent(retry) });
      }
      return NextResponse.json({ ok: true, event: mapAuctionEvent(data) });
    }
    const event: AuctionEvent = {
      id: crypto.randomUUID(),
      name: body.name,
      auctionNumber,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      tcTemplateType: termsCols.tc_template_type,
      termsAndConditions: termsCols.terms_and_conditions,
      bidderTerms: termsCols.bidder_terms,
    };
    demo.events.unshift(event);
    return NextResponse.json({ ok: true, event });
  }

  if (body.action === "deleteEvent") {
    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "Event id required." }, { status: 400 });
    demo.events = demo.events.filter((row) => row.id !== id);
    for (const lot of demo.inventory) {
      if (lot.eventId === id) {
        lot.eventId = null;
        lot.auctionNumber = null;
      }
    }
    if (isSupabaseConfigured && supabase) {
      await supabase.from("lots").update({ event_id: null }).eq("event_id", id);
      const { error } = await supabase.from("auction_events").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "deleteLots") {
    const ids = collectLotIds(body);
    if (!ids.length) return NextResponse.json({ error: "Select at least one lot." }, { status: 400 });

    const demoDeleted: string[] = [];
    demo.inventory = demo.inventory.filter((lot) => {
      const hit = ids.includes(lot.id) || (lot.lotNumber != null && ids.includes(lot.lotNumber));
      if (hit) {
        demoDeleted.push(lot.id);
        unregisterDemoLot(lot.id);
        if (lot.slug) unregisterDemoLot(lot.slug);
        return false;
      }
      return true;
    });

    if (isSupabaseConfigured && supabase) {
      const found = new Map<string, string>();
      const byId = await supabase.from("lots").select("id").in("id", ids);
      for (const row of byId.data ?? []) found.set(String(row.id), String(row.id));
      if (found.size < ids.length) {
        const byNumber = await supabase.from("lots").select("id, lot_number").in("lot_number", ids);
        for (const row of byNumber.data ?? []) found.set(String(row.id), String(row.id));
      }
      if (found.size < ids.length) {
        const bySlug = await supabase.from("lots").select("id, slug").in("slug", ids);
        for (const row of bySlug.data ?? []) found.set(String(row.id), String(row.id));
      }
      const resolved = Array.from(found.values());
      if (!resolved.length) {
        return NextResponse.json({ error: "No matching lots to delete." }, { status: 404 });
      }
      await unlinkLotBids(supabase, resolved);
      const { error } = await supabase.from("lots").delete().in("id", resolved);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: resolved.length });
    }

    if (!demoDeleted.length) {
      return NextResponse.json({ error: "No matching lots to delete." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: demoDeleted.length });
  }

  if (body.action === "relistLots") {
    const ids = collectLotIds(body);
    if (!ids.length) return NextResponse.json({ error: "Select at least one lot." }, { status: 400 });
    const start = parseLotRangeStart(body.lotStart) ?? 9000;
    const sale = await resolveSaleEvent(supabase, demo, body.eventId);
    if (!sale) {
      return NextResponse.json({ error: "Pick a target auction." }, { status: 400 });
    }

    const existing = await listLotNumbers(supabase, demo.inventory);
    const assigned: Array<{ id: string; lotNumber: string }> = [];
    let cursor = start;

    const demoMatches = demo.inventory.filter(
      (lot) => ids.includes(lot.id) || (lot.lotNumber != null && ids.includes(lot.lotNumber)),
    );
    for (const lot of demoMatches) {
      const lotNumber = nextFreeLotNumber(cursor, existing);
      const seq = parseLotSeq(lotNumber) ?? cursor;
      cursor = seq + 1;
      existing.push({ lotNumber });
      applyEventToLot(lot, sale, true);
      lot.lotNumber = lotNumber;
      lot.highBidder = null;
      lot.highBidderId = null;
      lot.paidAt = null;
      lot.helcimPurchaseTransactionId = null;
      lot.fulfillment = "unset";
      lot.currentBid = lot.startingBid ?? lot.currentBid;
      lot.status = "live";
      registerDemoLot(lot);
      assigned.push({ id: lot.id, lotNumber });
    }

    if (isSupabaseConfigured && supabase) {
      const { data: rows, error: lookupError } = await supabase.from("lots").select("*").in("id", ids);
      let matched = (rows ?? []) as LotRow[];
      if (lookupError || !matched.length) {
        const extra = await supabase.from("lots").select("*").in("lot_number", ids);
        matched = ((extra.data ?? []) as LotRow[]).concat(matched);
      }
      const unique = new Map(matched.map((row) => [String(row.id), row]));
      if (!unique.size) {
        return NextResponse.json({ error: "No matching lots to relist." }, { status: 404 });
      }
      const eventId = asEventUuid(sale.id) ?? sale.id;
      const numbered: Array<{ id: string; lotNumber: string }> = [];
      for (const row of Array.from(unique.values())) {
        const lotNumber = nextFreeLotNumber(cursor, existing);
        const seq = parseLotSeq(lotNumber) ?? cursor;
        cursor = seq + 1;
        existing.push({ lotNumber });
        numbered.push({ id: String(row.id), lotNumber });
      }
      await unlinkLotBids(
        supabase,
        numbered.map((row) => row.id),
      );
      for (const row of numbered) {
        const startBid =
          Number(unique.get(row.id)?.starting_bid ?? unique.get(row.id)?.current_bid ?? 0) || 0;
        const patch: Record<string, unknown> = {
          event_id: eventId,
          lot_number: row.lotNumber,
          status: "live",
          ends_at: sale.endsAt,
          high_bidder: null,
          high_bidder_id: null,
          paid_at: null,
          current_bid: startBid,
          fulfillment: "unset",
        };
        let patched = await patchLotRow(row.id, patch);
        if (!patched.ok && /paid_at|fulfillment|helcim/i.test(patched.body)) {
          delete patch.paid_at;
          delete patch.fulfillment;
          patched = await patchLotRow(row.id, patch);
        }
        if (!patched.ok) {
          return NextResponse.json(
            { error: patched.body || `Could not relist ${row.lotNumber}.` },
            { status: 400 },
          );
        }
      }
      return NextResponse.json({
        ok: true,
        eventId: sale.id,
        auctionNumber: sale.auctionNumber,
        lots: numbered,
        start: formatLotNumber(start),
      });
    }

    if (!assigned.length) {
      return NextResponse.json({ error: "No matching lots to relist." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      eventId: sale.id,
      auctionNumber: sale.auctionNumber,
      lots: assigned,
      start: formatLotNumber(start),
    });
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
    const sale = await resolveSaleEvent(supabase, demo, body.eventId);
    const status: LotStatus = "live";
    const endsAt = sale?.endsAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

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
      const eventId = sale ? asEventUuid(sale.id) ?? sale.id : null;
      const eventEnds = sale?.endsAt ?? endsAt;
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
      const lot = mapLot(data as LotRow);
      if (sale) attachLotToSale(lot, sale);
      return NextResponse.json(
        withHouseSettings(
          {
            ok: true,
            lot,
            href: "/live",
            auctionLabel: auctionLabel(sale, lot),
            saleStartsAt: sale?.startsAt ?? null,
            postedLive: true,
          },
          demo,
          houseSettings,
        ),
      );
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
      eventId: sale?.id || null,
      lotNumber,
      auctionNumber: sale?.auctionNumber ?? null,
      startingBid: starting,
      reservePrice: buyNow || null,
      buyNowPrice: buyNow || null,
      listingGrade,
      itemDetails: itemDetails || null,
    };
    if (sale) attachLotToSale(lot, sale);
    addDemoLot(lot);
    const houseSettings = await commitHouseLot(null, demo, claimed.settings, lotNumber, claimed.existing);
    return NextResponse.json(
      withHouseSettings(
        {
          ok: true,
          lot,
          href: "/live",
          auctionLabel: auctionLabel(sale, lot),
          saleStartsAt: sale?.startsAt ?? null,
          postedLive: true,
        },
        demo,
        houseSettings,
      ),
    );
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
      if (body.tcTemplateType != null || body.termsAndConditions != null) {
        const cols = auctionTermsColumns({
          tcTemplateType: body.tcTemplateType ?? event.tcTemplateType,
          termsAndConditions: body.termsAndConditions ?? event.termsAndConditions,
        });
        event.tcTemplateType = cols.tc_template_type;
        event.termsAndConditions = cols.terms_and_conditions;
        event.bidderTerms = cols.bidder_terms;
      }
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
      if (body.tcTemplateType != null || body.termsAndConditions != null) {
        Object.assign(
          updates,
          auctionTermsColumns({
            tcTemplateType: body.tcTemplateType,
            termsAndConditions: body.termsAndConditions,
          }),
        );
      }
      const { error } = await supabase.from("auction_events").update(updates).eq("id", body.id);
      if (error && /tc_template|terms_and_conditions|bidder_terms/i.test(error.message)) {
        delete updates.tc_template_type;
        delete updates.terms_and_conditions;
        delete updates.bidder_terms;
        const retryTerms = await supabase.from("auction_events").update(updates).eq("id", body.id);
        if (retryTerms.error && /archived_at/i.test(retryTerms.error.message)) {
          delete updates.archived_at;
          const retry = await supabase.from("auction_events").update(updates).eq("id", body.id);
          if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
        } else if (retryTerms.error) {
          return NextResponse.json({ error: retryTerms.error.message }, { status: 400 });
        }
      } else if (error && /archived_at/i.test(error.message)) {
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
        const event = await resolveSaleEvent(null, demo, body.eventId);
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
          status: "live",
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
        } catch {
          photos = row.image_urls ?? [];
        }
        const { image, images } = lotPhotos(photos);
        const event = await resolveSaleEvent(supabase, demo, body.eventId);
        const eventId = event ? asEventUuid(event.id) ?? event.id : null;
        const eventEnds =
          event?.endsAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
        const houseStatus: LotStatus = "live";
        const { data: existingRows, error: existingError } = await supabase
          .from("lots")
          .select("*")
          .eq("consignment_id", row.id)
          .limit(1);
        if (existingError && !isMissingColumn(existingError, "consignment_id")) {
          return NextResponse.json({ error: existingError.message }, { status: 400 });
        }
        if (existingRows?.length) {
          const existing = existingRows[0] as LotRow;
          const reopen: Record<string, unknown> = {
            status: "live",
            ends_at: eventEnds,
            title: row.title,
            description: row.description ?? existing.description,
            current_bid: starting || Number(existing.current_bid),
            starting_bid: starting || Number(existing.starting_bid),
          };
          if (eventId) reopen.event_id = eventId;
          reopen.image_url = image;
          reopen.image_urls = images;
          const patched = await patchLotRow(String(existing.id), reopen);
          if (!patched.ok || !patched.data?.length) {
            await supabase.from("consignments").update({ status: "pending" }).eq("id", row.id);
            return NextResponse.json(
              { error: patched.body || "Could not file this item into the live sale." },
              { status: 400 },
            );
          }
          const lot = mapLot({ ...existing, ...reopen } as LotRow);
          lot.auctionNumber = event?.auctionNumber ?? lot.auctionNumber;
          lot.eventId = eventId ?? lot.eventId;
          lot.status = "live";
          return NextResponse.json({
            ok: true,
            lot,
            href: "/live",
            auctionLabel: auctionLabel(event, lot),
            saleStartsAt: event?.startsAt ?? null,
            postedLive: true,
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
          let { data: lotRow, error: lotError } = await insertLotRow(supabase, insertRow);
          if (lotError || !lotRow) {
            await supabase.from("consignments").update({ status: "pending" }).eq("id", row.id);
            return NextResponse.json(
              { error: lotError?.message || "Could not file this item into the live sale." },
              { status: 400 },
            );
          }
          if (eventId) {
            await patchLotRow(String((lotRow as LotRow).id), {
              event_id: eventId,
              ends_at: eventEnds,
              status: "live",
            });
          }
          const lot = mapLot(lotRow as LotRow);
          if (event) attachLotToSale(lot, event);
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
    if (body.remove) {
      lot.status = "removed";
      lot.endsAt = new Date().toISOString();
      if (lot.highBidder || lot.highBidderId) {
        void recordSoldLotSettlement(lot, {
          id: lot.highBidderId,
          fullName: lot.highBidder,
        }, lot.auctionNumber);
      }
    }
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
      const id = body.id ?? "";
      let { data: current } = await supabase.from("lots").select("*").eq("id", id).maybeSingle();
      if (!current && id) {
        const byNumber = await supabase.from("lots").select("*").eq("lot_number", id).limit(1).maybeSingle();
        current = byNumber.data;
      }
      if (!current && id) {
        const bySlug = await supabase.from("lots").select("*").eq("slug", id).limit(1).maybeSingle();
        current = bySlug.data;
      }
      if (!current) {
        return NextResponse.json({ error: "Could not pull that lot from the sale." }, { status: 400 });
      }
      const mapped = mapLot(current as LotRow);
      const event = mapped.eventId
        ? (await supabase.from("auction_events").select("auction_number").eq("id", mapped.eventId).maybeSingle()).data
        : null;
      mapped.auctionNumber = event?.auction_number ?? mapped.auctionNumber;
      const closed = await patchLotRow(String(current.id), {
        status: "removed",
        ends_at: new Date().toISOString(),
      });
      if (!closed.ok || !closed.data?.length) {
        return NextResponse.json({ error: closed.body || "Could not pull that lot from the sale." }, { status: 400 });
      }
      const sold = Boolean(mapped.highBidder || mapped.highBidderId);
      if (sold) {
        await recordSoldLotSettlement(mapped, {
          id: mapped.highBidderId,
          fullName: mapped.highBidder,
        }, mapped.auctionNumber);
      }
      return NextResponse.json({
        ok: true,
        destination: sold ? "settlements" : "unsold",
      });
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
        const sale = await resolveSaleEvent(supabase, demo, body.eventId);
        const eventId = sale ? asEventUuid(sale.id) ?? sale.id : asEventUuid(body.eventId) ?? body.eventId;
        updates.event_id = eventId;
        updates.ends_at = sale?.endsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        updates.status = "live";
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
        const lotId = String(body.id ?? "");
        let patched = await patchLotRow(lotId, updates);
        if ((!patched.ok || !patched.data?.length) && lotId) {
          const bySlug = await supabase.from("lots").select("id").eq("slug", lotId).maybeSingle();
          const byNumber = bySlug.data?.id
            ? null
            : await supabase.from("lots").select("id").eq("lot_number", lotId).maybeSingle();
          const resolved = bySlug.data?.id ?? byNumber?.data?.id;
          if (resolved && resolved !== lotId) patched = await patchLotRow(String(resolved), updates);
        }
        if (!patched.ok || !patched.data?.length) {
          return NextResponse.json(
            { error: patched.body || "Could not file that lot into the sale." },
            { status: 400 },
          );
        }
      }
    }
  }

  if (body.remove && lot) {
    return NextResponse.json({
      ok: true,
      destination: lot.highBidder || lot.highBidderId ? "settlements" : "unsold",
    });
  }

  return NextResponse.json({ ok: true });
}
