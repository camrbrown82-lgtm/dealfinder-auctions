import { agreementCommission } from "@/lib/commission";
import { isHouseConsignor } from "@/lib/consignors";
import { lotWasSold } from "@/lib/settlements";
import {
  lotImages,
  parseLotEndMs,
  type AuctionEvent,
  type AuctionLot,
  type Consignment,
} from "@/lib/utils";

export type LedgerStage =
  | "waiting"
  | "held"
  | "rejected"
  | "scheduled"
  | "live"
  | "sold"
  | "paid"
  | "settled"
  | "unsold";

const STAGE_LABEL: Record<LedgerStage, string> = {
  waiting: "Waiting for approval",
  held: "On hold",
  rejected: "Rejected",
  scheduled: "Filed into a sale",
  live: "Live and taking bids",
  sold: "Sold — buyer owes",
  paid: "Buyer paid — payout owed",
  settled: "Payout sent",
  unsold: "Closed with no bids",
};

/** Anything still needing a decision from the desk sorts to the top. */
const STAGE_ORDER: Record<LedgerStage, number> = {
  waiting: 0,
  held: 1,
  live: 2,
  scheduled: 3,
  sold: 4,
  paid: 5,
  settled: 6,
  unsold: 7,
  rejected: 8,
};

export type ConsignorLedgerItem = {
  key: string;
  consignor: string;
  consignmentId: string | null;
  lotId: string | null;
  lotHref: string | null;
  title: string;
  category: string;
  stage: LedgerStage;
  stageLabel: string;
  images: string[];
  submittedAt: string | null;
  lotNumber: string | null;
  auctionNumber: string | null;
  auctionName: string | null;
  endsAt: string | null;
  startingBid: number;
  buyNowPrice: number;
  currentBid: number;
  hammer: number | null;
  commissionLabel: string;
  houseCut: number;
  payout: number;
  paidAt: string | null;
  payoutSentAt: string | null;
  highBidder: string | null;
  fulfillment: "unset" | "ship" | "pickup";
  listingGrade: string | null;
  description: string | null;
  notes: string | null;
  charity: boolean;
  onBuyNow: boolean;
};

export type ConsignorLedgerTotals = {
  items: number;
  waiting: number;
  scheduled: number;
  live: number;
  sold: number;
  unsold: number;
  rejected: number;
  hammer: number;
  houseCut: number;
  /** Their share of lots the buyer has already paid for — ready to settle. */
  payoutReady: number;
  /** Their share of sold lots the buyer still owes on. */
  payoutPending: number;
  /** Their share already sent out. */
  payoutSent: number;
};

export type ConsignorLedgerGroup = {
  consignor: string;
  email: string | null;
  house: boolean;
  items: ConsignorLedgerItem[];
  totals: ConsignorLedgerTotals;
};

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function lotStage(lot: AuctionLot): LedgerStage {
  if (lot.payoutSentAt) return "settled";
  if (lot.paidAt) return "paid";
  if (lot.buyNowStatus === "sold" || lotWasSold(lot)) return "sold";
  if (lot.status === "draft" || lot.status === "paused") return "scheduled";
  if (lot.status === "ended" || lot.status === "removed") return "unsold";
  const end = parseLotEndMs(lot.endsAt);
  if (Number.isFinite(end) && end <= Date.now()) {
    return lot.highBidder || lot.highBidderId ? "sold" : "unsold";
  }
  return "live";
}

function queueStage(status: Consignment["status"]): LedgerStage {
  if (status === "rejected") return "rejected";
  if (status === "held") return "held";
  if (status === "approved") return "scheduled";
  return "waiting";
}

/** What the consignor keeps once the agreement split is applied to a sale. */
function split(consignor: string, hammer: number) {
  if (isHouseConsignor(consignor)) {
    return { label: "House stock", houseCut: hammer, payout: 0 };
  }
  const agreement = agreementCommission(hammer);
  if (!agreement) return { label: "—", houseCut: 0, payout: 0 };
  return { label: agreement.label, houseCut: agreement.house, payout: agreement.consignor };
}

function emptyTotals(): ConsignorLedgerTotals {
  return {
    items: 0,
    waiting: 0,
    scheduled: 0,
    live: 0,
    sold: 0,
    unsold: 0,
    rejected: 0,
    hammer: 0,
    houseCut: 0,
    payoutReady: 0,
    payoutPending: 0,
    payoutSent: 0,
  };
}

function tally(totals: ConsignorLedgerTotals, item: ConsignorLedgerItem) {
  totals.items += 1;
  if (item.stage === "waiting" || item.stage === "held") totals.waiting += 1;
  if (item.stage === "scheduled") totals.scheduled += 1;
  if (item.stage === "live") totals.live += 1;
  if (item.stage === "unsold") totals.unsold += 1;
  if (item.stage === "rejected") totals.rejected += 1;
  if (item.stage === "sold" || item.stage === "paid" || item.stage === "settled") {
    totals.sold += 1;
    totals.hammer += item.hammer ?? 0;
    totals.houseCut += item.houseCut;
    if (item.stage === "settled") totals.payoutSent += item.payout;
    else if (item.stage === "paid") totals.payoutReady += item.payout;
    else totals.payoutPending += item.payout;
  }
}

function itemFromLot(
  lot: AuctionLot,
  events: Map<string, AuctionEvent>,
  consignment?: Consignment,
  submittedAt?: string | null,
): ConsignorLedgerItem {
  const event = lot.eventId ? events.get(lot.eventId) : undefined;
  const stage = lotStage(lot);
  const sold = stage === "sold" || stage === "paid" || stage === "settled";
  const hammer = sold ? money(lot.currentBid) : null;
  const owner = (lot.consignor || consignment?.consignor || "").trim() || "Unnamed consignor";
  const share = split(owner, hammer ?? 0);
  const buyNow = money(lot.buyNowPrice ?? lot.reservePrice);
  // The submitted photos ride along on the lot once it is posted.
  const photos = lotImages(lot);
  return {
    key: consignment?.id ?? lot.id,
    consignor: owner,
    consignmentId: consignment?.id ?? lot.consignmentId ?? null,
    lotId: lot.id,
    lotHref: `/auctions/${encodeURIComponent(String(lot.slug || lot.id))}`,
    title: lot.title || consignment?.title || "Lot",
    category: String(lot.category ?? ""),
    stage,
    stageLabel: STAGE_LABEL[stage],
    images: photos.length ? photos : consignment?.imageUrls ?? [],
    submittedAt: submittedAt ?? null,
    lotNumber: lot.lotNumber ?? null,
    auctionNumber: event?.auctionNumber ?? lot.auctionNumber ?? null,
    auctionName: event?.name ?? null,
    endsAt: lot.endsAt ?? null,
    startingBid: money(lot.startingBid ?? lot.currentBid),
    buyNowPrice: buyNow,
    currentBid: money(lot.currentBid),
    hammer,
    commissionLabel: sold ? share.label : "—",
    houseCut: sold ? share.houseCut : 0,
    payout: sold ? share.payout : 0,
    paidAt: lot.paidAt ?? null,
    payoutSentAt: lot.payoutSentAt ?? null,
    highBidder: lot.highBidder ?? null,
    fulfillment: lot.fulfillment ?? "unset",
    listingGrade: lot.listingGrade ?? consignment?.listingGrade ?? null,
    description: lot.description ?? consignment?.description ?? null,
    notes: lot.itemDetails ?? consignment?.notes ?? null,
    charity: consignment?.charity === true,
    onBuyNow: buyNow > 0,
  };
}

function itemFromQueue(row: Consignment, submittedAt: string | null): ConsignorLedgerItem {
  const stage = queueStage(row.status);
  const buyNow = money(row.buyNowPrice ?? row.reservePrice);
  return {
    key: row.id,
    consignor: (row.consignor || "").trim() || "Unnamed consignor",
    consignmentId: row.id,
    lotId: null,
    lotHref: null,
    title: row.title,
    category: String(row.category ?? ""),
    stage,
    stageLabel: STAGE_LABEL[stage],
    images: row.imageUrls ?? [],
    submittedAt,
    lotNumber: null,
    auctionNumber: null,
    auctionName: null,
    endsAt: null,
    startingBid: money(row.startingBid),
    buyNowPrice: buyNow,
    currentBid: 0,
    hammer: null,
    commissionLabel: "—",
    houseCut: 0,
    payout: 0,
    paidAt: null,
    payoutSentAt: null,
    highBidder: null,
    fulfillment: "unset",
    listingGrade: row.listingGrade ?? row.condition ?? null,
    description: row.description ?? null,
    notes: row.notes ?? null,
    charity: row.charity === true,
    onBuyNow: buyNow > 0,
  };
}

function sortItems(items: ConsignorLedgerItem[]) {
  return items.sort((a, b) => {
    const stage = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
    if (stage !== 0) return stage;
    const left = Date.parse(String(a.submittedAt ?? ""));
    const right = Date.parse(String(b.submittedAt ?? ""));
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return right - left;
    return String(b.lotNumber ?? "").localeCompare(String(a.lotNumber ?? ""));
  });
}

/**
 * One row per consigned item, grouped by the person who brought it in. A
 * consignment and the lot it became share a row, so nothing is counted twice
 * as it moves out of the queue and into a sale.
 */
export function buildConsignorLedger(input: {
  consignments: Consignment[];
  lots: AuctionLot[];
  events: AuctionEvent[];
  submittedAt?: Map<string, string>;
}): ConsignorLedgerGroup[] {
  const events = new Map(input.events.map((event) => [event.id, event]));
  const lotByConsignment = new Map<string, AuctionLot>();
  for (const lot of input.lots) {
    if (lot.consignmentId) lotByConsignment.set(lot.consignmentId, lot);
  }

  const items: ConsignorLedgerItem[] = [];
  const emails = new Map<string, string>();
  const posted = new Set<string>();

  for (const row of input.consignments) {
    const name = (row.consignor || "").trim() || "Unnamed consignor";
    if (row.contactEmail && !emails.has(name)) emails.set(name, row.contactEmail);
    const lot = lotByConsignment.get(row.id);
    const submitted = input.submittedAt?.get(row.id) ?? null;
    if (lot) {
      posted.add(lot.id);
      items.push(itemFromLot(lot, events, row, submitted));
    } else {
      items.push(itemFromQueue(row, submitted));
    }
  }

  // Lots cataloged straight at the desk never had a consignment row, but they
  // still belong to whoever dropped them off.
  for (const lot of input.lots) {
    if (posted.has(lot.id)) continue;
    items.push(itemFromLot(lot, events));
  }

  const groups = new Map<string, ConsignorLedgerGroup>();
  for (const item of items) {
    let group = groups.get(item.consignor);
    if (!group) {
      group = {
        consignor: item.consignor,
        email: emails.get(item.consignor) ?? null,
        house: isHouseConsignor(item.consignor),
        items: [],
        totals: emptyTotals(),
      };
      groups.set(item.consignor, group);
    }
    group.items.push(item);
    tally(group.totals, item);
  }

  const list = Array.from(groups.values());
  for (const group of list) sortItems(group.items);

  return list.sort((a, b) => {
    if (a.house !== b.house) return a.house ? 1 : -1;
    if (a.totals.waiting !== b.totals.waiting) return b.totals.waiting - a.totals.waiting;
    return a.consignor.localeCompare(b.consignor);
  });
}
