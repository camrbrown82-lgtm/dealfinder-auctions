import type { AuctionEvent, AuctionLot } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WeeklySalePlan = {
  auctionNumber: string;
  name: string;
  startsAt: string;
  endsAt: string;
  legacyNumber: string;
};

/**
 * Hammer Sundays in Airdrie (MDT). Bidding is open through the hammer:
 * this week through Sep 20, then the 27th, then Oct 4.
 */
export const WEEKLY_SALES: WeeklySalePlan[] = [
  {
    auctionNumber: "AU-2026-0920",
    legacyNumber: "AU-2026-001",
    name: "Weekly sale · Sep 20",
    startsAt: "2026-09-14T10:00:00-06:00",
    endsAt: "2026-09-20T18:00:00-06:00",
  },
  {
    auctionNumber: "AU-2026-0927",
    legacyNumber: "AU-2026-002",
    name: "Weekly sale · Sep 27",
    startsAt: "2026-09-20T18:00:00-06:00",
    endsAt: "2026-09-27T18:00:00-06:00",
  },
  {
    auctionNumber: "AU-2026-1004",
    legacyNumber: "AU-2026-003",
    name: "Weekly sale · Oct 4",
    startsAt: "2026-09-27T18:00:00-06:00",
    endsAt: "2026-10-04T18:00:00-06:00",
  },
];

const WEEKLY_NUMBERS = new Set(
  WEEKLY_SALES.flatMap((sale) => [sale.auctionNumber, sale.legacyNumber]),
);

let lastEnsure = 0;
let ensurePromise: Promise<AuctionEvent[]> | null = null;

export function isWeeklySale(event: Pick<AuctionEvent, "auctionNumber" | "name">) {
  if (event.auctionNumber && WEEKLY_NUMBERS.has(event.auctionNumber)) return true;
  return WEEKLY_SALES.some((sale) => event.name === sale.name);
}

export function nextWeeklySale(events: AuctionEvent[], now = Date.now()) {
  const open = events
    .filter((event) => !event.archivedAt && new Date(event.endsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const live = open.find((event) => new Date(event.startsAt).getTime() <= now);
  return live ?? open[0] ?? null;
}

function mapEventRow(row: {
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

async function listEvents(supabase: SupabaseClient) {
  const { data } = await supabase.from("auction_events").select("*").order("starts_at", { ascending: true });
  return (data ?? []).map((row) => mapEventRow(row as Parameters<typeof mapEventRow>[0]));
}

function saleFields(sale: WeeklySalePlan) {
  return {
    name: sale.name,
    auction_number: sale.auctionNumber,
    starts_at: sale.startsAt,
    ends_at: sale.endsAt,
    archived_at: null,
  };
}

export async function ensureWeeklySales(supabase: SupabaseClient | null) {
  if (!supabase) {
    return WEEKLY_SALES.map((sale) => ({
      id: `weekly-${sale.auctionNumber}`,
      name: sale.name,
      auctionNumber: sale.auctionNumber,
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
    }));
  }

  const now = Date.now();
  if (ensurePromise && now - lastEnsure < 15_000) return ensurePromise;
  ensurePromise = (async () => {
    let events = await listEvents(supabase);
    const claimed = new Set<string>();

    for (const sale of WEEKLY_SALES) {
      const available = events.filter((event) => !claimed.has(event.id) && !event.archivedAt);
      const match =
        available.find((event) => event.auctionNumber === sale.auctionNumber) ??
        available.find((event) => event.auctionNumber === sale.legacyNumber) ??
        available.find((event) => event.name === sale.name) ??
        available.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

      if (match) {
        claimed.add(match.id);
        const { error } = await supabase.from("auction_events").update(saleFields(sale)).eq("id", match.id);
        if (error && /archived_at/i.test(error.message)) {
          const { archived_at: _a, ...rest } = saleFields(sale);
          await supabase.from("auction_events").update(rest).eq("id", match.id);
        }
      } else {
        const inserted = await supabase.from("auction_events").insert(saleFields(sale)).select("id").maybeSingle();
        if (inserted.error && /archived_at/i.test(inserted.error.message)) {
          const { archived_at: _a, ...rest } = saleFields(sale);
          await supabase.from("auction_events").insert(rest);
        } else if (inserted.data?.id) {
          claimed.add(inserted.data.id);
        }
      }
      events = await listEvents(supabase);
    }

    events = await listEvents(supabase);
    const keep = new Set(
      events.filter((event) => isWeeklySale(event) && !event.archivedAt).map((event) => event.id),
    );
    const extras = events.filter((event) => !keep.has(event.id) && !event.archivedAt);
    const dest = nextWeeklySale(events.filter((event) => keep.has(event.id))) ?? events.find((event) => keep.has(event.id));
    if (extras.length && dest) {
      const { data: extraLots } = await supabase
        .from("lots")
        .select("id, status, high_bidder, high_bidder_id")
        .in(
          "event_id",
          extras.map((event) => event.id),
        );
      for (const row of extraLots ?? []) {
        const sold = row.status === "ended" && (row.high_bidder || row.high_bidder_id);
        if (row.status === "removed" || sold) continue;
        await supabase
          .from("lots")
          .update({ event_id: dest.id, ends_at: dest.endsAt, status: "live" })
          .eq("id", row.id);
      }
      const archivedAt = new Date().toISOString();
      await supabase
        .from("auction_events")
        .update({ archived_at: archivedAt })
        .in(
          "id",
          extras.map((event) => event.id),
        );
    }

    events = await listEvents(supabase);
    const weekly = events.filter((event) => isWeeklySale(event) && !event.archivedAt);
    for (const event of weekly) {
      const { data: lots } = await supabase
        .from("lots")
        .select("id, status, high_bidder, high_bidder_id")
        .eq("event_id", event.id);
      for (const row of lots ?? []) {
        const sold = row.status === "ended" && (row.high_bidder || row.high_bidder_id);
        if (row.status === "removed" || sold) continue;
        await supabase
          .from("lots")
          .update({ ends_at: event.endsAt, status: "live" })
          .eq("id", row.id);
      }
    }

    const next = nextWeeklySale(weekly);
    if (next) {
      const { data: orphans } = await supabase
        .from("lots")
        .select("id, event_id, status, high_bidder, high_bidder_id")
        .is("event_id", null)
        .not("status", "in", "(removed)");
      for (const row of orphans ?? []) {
        const sold = row.status === "ended" && (row.high_bidder || row.high_bidder_id);
        if (sold) continue;
        await supabase
          .from("lots")
          .update({ event_id: next.id, ends_at: next.endsAt, status: "live" })
          .eq("id", row.id);
      }
    }

    lastEnsure = Date.now();
    return listEvents(supabase);
  })();
  try {
    return await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    lastEnsure = 0;
    throw error;
  }
}

export function attachLotToSale(lot: AuctionLot, event: AuctionEvent) {
  lot.eventId = event.id;
  lot.auctionNumber = event.auctionNumber ?? lot.auctionNumber;
  lot.endsAt = event.endsAt;
  lot.status = "live";
}
