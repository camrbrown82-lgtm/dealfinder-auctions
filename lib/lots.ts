import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { openRows } from "@/lib/openFloor";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import { mapLot, type LotRow } from "@/lib/mappers";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { MOCK_LOTS, getLotById, filterLots, lotImages, uniqueImageUrls, type AuctionEvent, type AuctionLot } from "@/lib/utils";
import { ensureWeeklySales } from "@/lib/weeklySales";

function withGallery(lot: AuctionLot): AuctionLot {
  if (isSupabaseConfigured) return lot;
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

export async function fetchLiveCatalog(): Promise<{
  lots: AuctionLot[];
  events: AuctionEvent[];
  floor?: Awaited<ReturnType<typeof openRows>>;
}> {
  if (!isSupabaseConfigured) {
    const demo = getAdminDemo();
    stampAuctionNumbers(demo);
    return { lots: catalogLots(), events: demo.events };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { lots: [], events: [] };
  }

  await ensureWeeklySales(supabase).catch((error) => {
    console.error("ensureWeeklySales", error instanceof Error ? error.message : error);
  });

  const [{ data, error }, eventsRes] = await Promise.all([
    supabase.from("lots").select("*").order("ends_at", { ascending: true }),
    supabase.from("auction_events").select("*").order("starts_at", { ascending: true }),
  ]);

  if (error || !data) {
    console.error("fetchLiveLots", error?.message);
    return { lots: [], events: [] };
  }

  const rows = Array.isArray(data) ? (data as LotRow[]) : [];
  const floor = await openRows(rows);

  const events = (eventsRes.data ?? []).map((row) =>
    mapAuctionEvent(row as Parameters<typeof mapAuctionEvent>[0]),
  );
  const numbers = new Map(events.map((event) => [event.id, event.auctionNumber ?? null]));
  const lots = rows
    .map((row) => {
      const lot = withGallery(mapLot(row));
      lot.auctionNumber = row.event_id ? numbers.get(row.event_id) ?? null : lot.auctionNumber;
      return lot;
    })
    .filter((lot) => lot.status !== "removed" && lot.status !== "draft" && lot.status !== "ended");

  return { lots, events, floor };
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
        lot = withGallery(mapLot(data as unknown as LotRow));
        const consignmentId = String(data.consignment_id ?? "");
        if (consignmentId) {
          const consignment = await supabase
            .from("consignments")
            .select("image_urls")
            .eq("id", consignmentId)
            .maybeSingle();
          const extra = Array.isArray(consignment.data?.image_urls)
            ? (consignment.data.image_urls as string[])
            : [];
          lot.images = uniqueImageUrls([...(lot.images ?? []), ...extra, lot.image]);
        }
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

  if (!lot && isSupabaseConfigured) return undefined;
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
