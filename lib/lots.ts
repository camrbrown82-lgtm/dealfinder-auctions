import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapLot, type LotRow } from "@/lib/mappers";
import { getDemoLot } from "@/lib/demoAuctionStore";
import { getAdminDemo, stampAuctionNumbers } from "@/lib/demoAdminStore";
import { MOCK_LOTS, getLotById, filterLots, lotImages, type AuctionLot } from "@/lib/utils";

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

export async function fetchLiveLots(): Promise<AuctionLot[]> {
  if (!isSupabaseConfigured) {
    return filterLots(catalogLots(), "All");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return filterLots(MOCK_LOTS, "All");

  const [{ data, error }, eventsRes] = await Promise.all([
    supabase.from("lots").select("*").in("status", ["live"]).order("ends_at", { ascending: true }),
    supabase.from("auction_events").select("id, auction_number"),
  ]);

  if (error || !data) return filterLots(MOCK_LOTS, "All");
  const numbers = new Map(
    (eventsRes.data ?? []).map((row) => [row.id as string, row.auction_number as string | null]),
  );
  return (data as LotRow[]).map((row) => {
    const lot = withGallery(mapLot(row));
    lot.auctionNumber = row.event_id ? numbers.get(row.event_id) ?? null : lot.auctionNumber;
    return lot;
  });
}

export async function fetchLot(id: string): Promise<AuctionLot | undefined> {
  let lot: AuctionLot | undefined;

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        );
      const query = uuid
        ? supabase.from("lots").select("*").or(`id.eq.${id},slug.eq.${id}`)
        : supabase.from("lots").select("*").eq("slug", id);
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        lot = withGallery(mapLot(data as LotRow));
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
