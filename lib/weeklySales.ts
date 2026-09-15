import type { SupabaseClient } from "@supabase/supabase-js";
import { patchLotRow, patchTableRow } from "@/lib/openFloor";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";

export type WeeklySalePlan = {
  auctionNumber: string;
  name: string;
  startsAt: string;
  endsAt: string;
  legacyNumber?: string;
};

const LEGACY = ["AU-2026-001", "AU-2026-002", "AU-2026-003"];

const HAMMERS = [
  { y: 2026, m: 9, d: 20, month: "Sep" },
  { y: 2026, m: 9, d: 27, month: "Sep" },
  { y: 2026, m: 10, d: 4, month: "Oct" },
  { y: 2026, m: 10, d: 11, month: "Oct" },
  { y: 2026, m: 10, d: 18, month: "Oct" },
] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDay(y: number, m: number, d: number, time: string) {
  return `${y}-${pad(m)}-${pad(d)}T${time}-06:00`;
}

/** Five weekly hammers starting Sunday Sep 20, 2026 (Airdrie 18:00 MDT). */
export const WEEKLY_SALES: WeeklySalePlan[] = HAMMERS.map((hammer, index) => {
  const prev = index === 0 ? null : HAMMERS[index - 1];
  return {
    auctionNumber: `AU-${hammer.y}-${pad(hammer.m)}${pad(hammer.d)}`,
    legacyNumber: LEGACY[index],
    name: `Weekly sale · ${hammer.month} ${hammer.d}`,
    startsAt: prev
      ? isoDay(prev.y, prev.m, prev.d, "18:00:00")
      : isoDay(2026, 9, 14, "10:00:00"),
    endsAt: isoDay(hammer.y, hammer.m, hammer.d, "18:00:00"),
  };
});

export const FIRST_WEEKLY_SALE = WEEKLY_SALES[0];

const WEEKLY_NUMBERS = new Set(
  WEEKLY_SALES.flatMap((sale) => [sale.auctionNumber, sale.legacyNumber].filter(Boolean) as string[]),
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

export function firstWeeklyEvent(events: AuctionEvent[]) {
  const open = events.filter((event) => !event.archivedAt);
  return (
    open.find((event) => event.auctionNumber === FIRST_WEEKLY_SALE.auctionNumber) ??
    open.find((event) => event.auctionNumber === FIRST_WEEKLY_SALE.legacyNumber) ??
    open.find((event) => event.name === FIRST_WEEKLY_SALE.name) ??
    nextWeeklySale(events)
  );
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

function isSold(row: { status?: string | null; high_bidder?: string | null; high_bidder_id?: string | null }) {
  return row.status === "ended" && Boolean(row.high_bidder || row.high_bidder_id);
}

async function placeLotOnSale(lotId: string, sale: AuctionEvent) {
  return patchLotRow(lotId, {
    event_id: sale.id,
    ends_at: sale.endsAt,
    status: "live",
  });
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
      const isFirst = sale.auctionNumber === FIRST_WEEKLY_SALE.auctionNumber;
      const match =
        available.find((event) => event.auctionNumber === sale.auctionNumber) ??
        available.find((event) => event.name === sale.name) ??
        (isFirst
          ? available.find((event) => event.auctionNumber === FIRST_WEEKLY_SALE.legacyNumber)
          : undefined);

      if (match) {
        claimed.add(match.id);
        const patched = await patchTableRow("auction_events", match.id, saleFields(sale));
        if (!patched.ok && /archived_at/i.test(patched.body)) {
          const { archived_at: _a, ...rest } = saleFields(sale);
          await patchTableRow("auction_events", match.id, rest);
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
    const weeklyOpen = events.filter((event) => isWeeklySale(event) && !event.archivedAt);
    const keep = new Set(weeklyOpen.map((event) => event.id));
    const floor = firstWeeklyEvent(weeklyOpen);
    const staleIds = events.filter((event) => !keep.has(event.id)).map((event) => event.id);

    if (floor) {
      const { data: lots } = await supabase
        .from("lots")
        .select("id, event_id, status, high_bidder, high_bidder_id");
      const laterNumbers = new Set(WEEKLY_SALES.slice(1).map((sale) => sale.auctionNumber));
      const laterWeeks = new Set(
        weeklyOpen
          .filter((event) => event.auctionNumber && laterNumbers.has(event.auctionNumber))
          .map((event) => event.id),
      );
      for (const row of lots ?? []) {
        if (row.status === "removed" || isSold(row)) continue;
        const eventId = (row.event_id as string | null) ?? null;
        if (eventId && laterWeeks.has(eventId)) continue;
        await placeLotOnSale(String(row.id), floor);
      }
    }

    const extras = events.filter((event) => staleIds.includes(event.id) && !event.archivedAt);
    if (extras.length) {
      const archivedAt = new Date().toISOString();
      for (const extra of extras) {
        await patchTableRow("auction_events", extra.id, { archived_at: archivedAt });
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
