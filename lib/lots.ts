import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapLot, type LotRow } from "@/lib/mappers";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { MOCK_LOTS, getLotById, filterLots, lotImages, parseLotEndMs, type AuctionLot } from "@/lib/utils";
import type { AuctionEvent } from "@/lib/utils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function ensureLotBidable(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  row: Record<string, unknown>,
) {
  if (row.status === "removed") return row;
  const now = Date.now();
  const end = parseLotEndMs(row.ends_at as string);
  const sold = row.status === "ended" && Boolean(row.high_bidder || row.high_bidder_id);
  if (sold && Number.isFinite(end) && end <= now) return row;
  const patch: Record<string, unknown> = {};
  if (row.status !== "live") patch.status = "live";
  if (!Number.isFinite(end) || end <= now) {
    patch.ends_at = new Date(now + WEEK_MS).toISOString();
  }
  if (!Object.keys(patch).length) return row;
  await supabase.from("lots").update(patch).eq("id", row.id);
  return { ...row, ...patch };
}

async function openActiveFloors(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data } = await supabase.from("lots").select("*").neq("status", "removed");
  for (const row of data ?? []) {
    await ensureLotBidable(supabase, row as Record<string, unknown>);
  }
}

function withGallery(lot: AuctionLot): AuctionLot {
  if (lotImages(lot).length > 1) return lot;
  const mock = MOCK_LOTS.find(
    (row) => row.id === lot.id || row.slug === lot.slug || row.slug === lot.id || row.id === lot.slug,
  );
  if (!mock || lotImages(mock).length <= 1) return lot;
  return { ...lot, image: mock.image, images: mock.images };
}

function catalogLots(): AuctionLot[] {
  const demo = getAdminDemo();
  stampAuctionNumbers(demo);
  const byId = new Map<string, AuctionLot>();
  for (const lot of [...MOCK_LOTS, ...demo.inventory]) {
    byId.set(lot.id, lot);
  }
  return Array.from(byId.values()).map(withGallery);
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

export async function fetchLiveCatalog(): Promise<{ lots: AuctionLot[]; events: AuctionEvent[] }> {
  if (!isSupabaseConfigured) {
    const demo = getAdminDemo();
    stampAuctionNumbers(demo);
    return { lots: catalogLots(), events: demo.events };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const demo = getAdminDemo();
    stampAuctionNumbers(demo);
    return { lots: catalogLots(), events: demo.events };
  }

  await openActiveFloors(supabase);

  const [{ data, error }, eventsRes] = await Promise.all([
    supabase.from("lots").select("*").order("ends_at", { ascending: true }),
    supabase.from("auction_events").select("*").order("starts_at", { ascending: true }),
  ]);

  if (error || !data) {
    console.error("fetchLiveLots", error?.message);
    return { lots: [], events: [] };
  }

  const events = (eventsRes.data ?? []).map(mapEvent);
  const numbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
  const lots = (data as LotRow[])
    .map((row) => {
      const lot = withGallery(mapLot(row));
      lot.auctionNumber = row.event_id ? numbers.get(row.event_id) ?? null : lot.auctionNumber;
      return lot;
    })
    .filter((lot) => lot.status !== "removed" && lot.status !== "draft");

  return { lots, events };
}

export async function fetchLiveLots(): Promise<AuctionLot[]> {
  const { lots } = await fetchLiveCatalog();
  return filterLots(lots, "All");
}

export async function fetchLot(id: string): Promise<AuctionLot | undefined> {
  let lot: AuctionLot | undefined;

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const decoded = decodeURIComponent(id);
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          decoded,
        );
      let data: Record<string, unknown> | null = null;
      if (uuid) {
        const byId = await supabase.from("lots").select("*").eq("id", decoded).maybeSingle();
        data = (byId.data as Record<string, unknown> | null) ?? null;
      }
      if (!data) {
        const bySlug = await supabase.from("lots").select("*").eq("slug", decoded).limit(1).maybeSingle();
        data = (bySlug.data as Record<string, unknown> | null) ?? null;
      }
      if (!data) {
        const byNumber = await supabase.from("lots").select("*").eq("lot_number", decoded).limit(1).maybeSingle();
        data = (byNumber.data as Record<string, unknown> | null) ?? null;
      }
      if (data) {
        data = await ensureLotBidable(supabase, data);
        lot = withGallery(mapLot(data as unknown as LotRow));
        if (lot.eventId) {
          const { data: event } = await supabase
            .from("auction_events")
            .select("auction_number")
            .eq("id", lot.eventId)
            .maybeSingle();
          lot.auctionNumber = event?.auction_number ?? lot.auctionNumber;
        }
      }
    }
  }

  if (!lot) lot = getLotById(id);
  if (!lot) {
    const demo = getAdminDemo();
    lot = demo.inventory.find((row) => row.id === id || row.slug === id);
  }
  if (!lot) return undefined;
  lot = withGallery(lot);

  if (!isSupabaseConfigured) {
    const demoClock = getDemoLot(lot.id) ?? getDemoLot(id);
    if (demoClock) {
      return {
        ...lot,
        currentBid: demoClock.currentBid,
        endsAt: demoClock.endsAt,
        highBidder: demoClock.highBidder,
        highBidderId: demoClock.highBidderId,
        status: (demoClock.status as AuctionLot["status"]) ?? lot.status,
      };
    }
  }

  return lot;
}
