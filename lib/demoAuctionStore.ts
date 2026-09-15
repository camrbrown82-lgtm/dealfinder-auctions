import { MOCK_LOTS } from "@/lib/utils";
import type { AuctionLot } from "@/lib/utils";
import type { AbsenteeMax } from "@/lib/bidding";
import type { AdminBid } from "@/lib/adminTypes";
import { randomUUID } from "crypto";

export type DemoLotState = {
  id: string;
  currentBid: number;
  minIncrement: number;
  endsAt: string;
  highBidder: string | null;
  highBidderId: string | null;
  status: string;
  fulfillment?: "unset" | "ship" | "pickup";
  paidAt?: string | null;
  helcimPurchaseTransactionId?: string | null;
  absentees: AbsenteeMax[];
  bids: AdminBid[];
};

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderAuctionDemo: Map<string, DemoLotState> | undefined;
}

function map() {
  if (!globalThis.__dealfinderAuctionDemo) {
    globalThis.__dealfinderAuctionDemo = seed();
  }
  return globalThis.__dealfinderAuctionDemo;
}

function seed() {
  const next = new Map<string, DemoLotState>();
  for (const lot of MOCK_LOTS) {
    put(next, lot);
  }
  return next;
}

function put(target: Map<string, DemoLotState>, lot: AuctionLot) {
  const row: DemoLotState = {
    id: lot.id,
    currentBid: lot.currentBid,
    minIncrement: lot.minIncrement,
    endsAt: lot.endsAt,
    highBidder: lot.highBidder ?? null,
    highBidderId: lot.highBidderId ?? null,
    status: lot.status ?? "live",
    fulfillment: lot.fulfillment ?? "unset",
    paidAt: lot.paidAt ?? null,
    helcimPurchaseTransactionId: lot.helcimPurchaseTransactionId ?? null,
    absentees: [],
    bids: [],
  };
  const existing = target.get(lot.id);
  if (existing) {
    row.absentees = existing.absentees;
    row.bids = existing.bids;
    row.highBidder = existing.highBidder;
    row.highBidderId = existing.highBidderId;
    row.currentBid = existing.currentBid;
    row.fulfillment = existing.fulfillment ?? row.fulfillment;
    row.paidAt = existing.paidAt ?? row.paidAt;
    row.helcimPurchaseTransactionId =
      existing.helcimPurchaseTransactionId ?? row.helcimPurchaseTransactionId;
  }
  target.set(lot.id, row);
  if (lot.slug) target.set(lot.slug, row);
}

export function getDemoLot(id: string) {
  return map().get(id);
}

export function registerDemoLot(lot: AuctionLot) {
  put(map(), lot);
}

export function listDemoLots() {
  const seen = new Set<string>();
  const rows: DemoLotState[] = [];
  for (const row of Array.from(map().values())) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

export function seedDemoBidTape() {
  const lot = map().get("pow-001");
  if (!lot || lot.bids.length > 0) return;
  const now = Date.now();
  lot.bids = [
    {
      id: randomUUID(),
      lotId: lot.id,
      bidder: "Pat Paddle",
      email: "pat.paddle@example.com",
      amount: lot.currentBid,
      kind: "live",
      createdAt: new Date(now - 1000 * 60 * 12).toISOString(),
    },
    {
      id: randomUUID(),
      lotId: lot.id,
      bidder: "Kim Kapow",
      email: "kim.kapow@example.com",
      amount: lot.currentBid - 10,
      kind: "live",
      createdAt: new Date(now - 1000 * 60 * 18).toISOString(),
    },
  ];
  lot.highBidder = "Pat Paddle";
}

export function markDemoLotPaid(lotId: string, transactionId: string) {
  const lot = map().get(lotId);
  if (!lot) return null;
  lot.paidAt = new Date().toISOString();
  lot.helcimPurchaseTransactionId = transactionId;
  return lot;
}
