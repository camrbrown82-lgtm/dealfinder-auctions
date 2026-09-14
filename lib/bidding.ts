import { parseLotEndMs } from "@/lib/utils";

export const ANTI_SNIPE_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPE_EXTEND_MS = 2 * 60 * 1000;

export type AbsenteeMax = {
  bidder: string;
  max: number;
};

export type BidKind = "live" | "absentee";

export type BidEvent = {
  bidder: string;
  amount: number;
  kind: BidKind;
};

export type AuctionClock = {
  currentBid: number;
  minIncrement: number;
  endsAt: string;
  highBidder: string | null;
  absentees: AbsenteeMax[];
};

export function nextLiveAmount(currentBid: number, minIncrement: number) {
  return currentBid + minIncrement;
}

export function extendIfSniping(endsAt: string, now = Date.now()) {
  const remaining = parseLotEndMs(endsAt, now) - now;
  if (remaining > 0 && remaining <= ANTI_SNIPE_WINDOW_MS) {
    return {
      endsAt: new Date(now + ANTI_SNIPE_EXTEND_MS).toISOString(),
      extended: true,
    };
  }
  return { endsAt, extended: false };
}

function upsertAbsentee(list: AbsenteeMax[], bidder: string, max: number) {
  const next = list.filter((row) => row.bidder !== bidder);
  next.push({ bidder, max });
  return next;
}

function bestChallenger(state: AuctionClock) {
  const floor = state.currentBid + state.minIncrement;
  const challengers = state.absentees
    .filter((row) => row.bidder !== state.highBidder && row.max >= floor)
    .sort((a, b) => b.max - a.max || a.bidder.localeCompare(b.bidder));
  return challengers[0] ?? null;
}

function runProxy(state: AuctionClock, events: BidEvent[]) {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const challenger = bestChallenger(state);
    if (!challenger) break;
    const amount = state.currentBid + state.minIncrement;
    if (amount > challenger.max) break;
    state.currentBid = amount;
    state.highBidder = challenger.bidder;
    events.push({ bidder: challenger.bidder, amount, kind: "absentee" });
  }
}

export function placeLiveBid(
  state: AuctionClock,
  bidder: string,
  amount: number,
  now = Date.now(),
) {
  const minimum = state.currentBid + state.minIncrement;
  if (amount < minimum) {
    throw new Error(`Bid must be at least ${minimum}`);
  }

  const events: BidEvent[] = [{ bidder, amount, kind: "live" }];
  state.currentBid = amount;
  state.highBidder = bidder;
  const snipe = extendIfSniping(state.endsAt, now);
  state.endsAt = snipe.endsAt;
  runProxy(state, events);
  const afterProxy = extendIfSniping(state.endsAt, now);
  state.endsAt = afterProxy.endsAt;

  return { state, events, extended: snipe.extended || afterProxy.extended };
}

export function placeAbsenteeMax(
  state: AuctionClock,
  bidder: string,
  maxAmount: number,
  now = Date.now(),
) {
  const minimum = state.currentBid + state.minIncrement;
  if (maxAmount < minimum) {
    throw new Error(`Absentee max must be at least ${minimum}`);
  }

  state.absentees = upsertAbsentee(state.absentees, bidder, maxAmount);
  const events: BidEvent[] = [];
  const opening = state.currentBid + state.minIncrement;
  if (opening <= maxAmount) {
    state.currentBid = opening;
    state.highBidder = bidder;
    events.push({ bidder, amount: opening, kind: "absentee" });
  }

  const snipe = extendIfSniping(state.endsAt, now);
  state.endsAt = snipe.endsAt;
  runProxy(state, events);
  const afterProxy = extendIfSniping(state.endsAt, now);
  state.endsAt = afterProxy.endsAt;

  return { state, events, extended: snipe.extended || afterProxy.extended };
}
