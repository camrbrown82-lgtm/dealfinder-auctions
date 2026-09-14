import {
  MOCK_CONSIGNMENTS,
  MOCK_LOTS,
  type AuctionEvent,
  type AuctionLot,
  type Consignment,
  type LotCategory,
} from "@/lib/utils";
import { registerDemoLot, seedDemoBidTape } from "@/lib/demoAuctionStore";
import { suggestLotNumber } from "@/lib/catalogNumbers";
import { DEFAULT_HOUSE_STARTING_BID, type HouseDeskSettings } from "@/lib/houseDesk";

export type AdminDemoState = {
  queue: Consignment[];
  inventory: AuctionLot[];
  events: AuctionEvent[];
  houseSettings: HouseDeskSettings;
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderAdminDemo: AdminDemoState | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getAdminDemo(): AdminDemoState {
  if (!globalThis.__dealfinderAdminDemo) {
    const events: AuctionEvent[] = [
      {
        id: "evt-friday-pow",
        name: "Friday Night POW Sale",
        auctionNumber: "AU-2026-001",
        startsAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        endsAt: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
      },
    ];
    globalThis.__dealfinderAdminDemo = {
      queue: clone(MOCK_CONSIGNMENTS),
      inventory: clone(MOCK_LOTS).map((lot) => ({
        ...lot,
        eventId: lot.status === "ended" ? "evt-friday-pow" : "evt-friday-pow",
        auctionNumber: "AU-2026-001",
      })),
      events,
      houseSettings: {
        defaultStartingBid: DEFAULT_HOUSE_STARTING_BID,
        nextLotNumber: suggestLotNumber(MOCK_LOTS),
      },
    };
    seedDemoBidTape();
  }
  const state = globalThis.__dealfinderAdminDemo;
  if (!state) {
    throw new Error("Admin demo store failed to initialize.");
  }
  if (!state.houseSettings) {
    state.houseSettings = {
      defaultStartingBid: DEFAULT_HOUSE_STARTING_BID,
      nextLotNumber: suggestLotNumber(state.inventory),
    };
  }
  return state;
}

export function stampAuctionNumbers(state: AdminDemoState) {
  const numbers = new Map(state.events.map((event) => [event.id, event.auctionNumber ?? null]));
  for (const lot of state.inventory) {
    if (lot.eventId) lot.auctionNumber = numbers.get(lot.eventId) ?? lot.auctionNumber;
  }
}

export function addDemoLot(lot: AuctionLot) {
  const state = getAdminDemo();
  state.inventory.unshift(lot);
  registerDemoLot(lot);
  return lot;
}

export function addDemoConsignment(item: Consignment) {
  const state = getAdminDemo();
  state.queue.unshift(item);
  return item;
}

export function seedDemoLots() {
  const state = getAdminDemo();
  const stamp = Date.now();
  const extras: AuctionLot[] = [
    {
      id: `seed-${stamp}-1`,
      slug: `seed-${stamp}-1`,
      title: "Seeded: lunchbox lot (6)",
      category: "Toys" as LotCategory,
      image:
        "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80",
      currentBid: 20,
      minIncrement: 5,
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
      consignor: "House stock",
      description: "Bulk seed — warehouse pull.",
      status: "paused",
      lotNumber: `LOT-S${String(stamp).slice(-4)}1`,
    },
    {
      id: `seed-${stamp}-2`,
      slug: `seed-${stamp}-2`,
      title: "Seeded: indie comic short box",
      category: "Comics",
      image:
        "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80",
      currentBid: 35,
      minIncrement: 5,
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(),
      consignor: "House stock",
      description: "Bulk seed — ungraded mix.",
      status: "paused",
      lotNumber: `LOT-S${String(stamp).slice(-4)}2`,
    },
    {
      id: `seed-${stamp}-3`,
      slug: `seed-${stamp}-3`,
      title: "Seeded: 7-inch soul singles",
      category: "Vinyl",
      image:
        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
      currentBid: 15,
      minIncrement: 5,
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
      consignor: "House stock",
      description: "Bulk seed — spinner rack.",
      status: "paused",
      lotNumber: `LOT-S${String(stamp).slice(-4)}3`,
    },
  ];
  state.inventory = [...extras, ...state.inventory];
  return extras.length;
}
