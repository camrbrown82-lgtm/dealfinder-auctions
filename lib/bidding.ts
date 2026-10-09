import { structuredIncrement } from "@/lib/bidIncrements";
import { parseLotEndMs } from "@/lib/utils";

export const ANTI_SNIPE_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPE_EXTEND_MS = 2 * 60 * 1000;

export type AbsenteeMax = {
  bidder: string;
  max: number;
  /** When this max was entered. An earlier time wins a tie at the same max. */
  placedAt?: number;
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

export function openingAsk(currentBid: number, minIncrement?: number) {
  if (currentBid > 0) return currentBid;
  const step = minIncrement && minIncrement > 0 ? minIncrement : structuredIncrement(currentBid);
  return step;
}

export function nextLiveAmount(currentBid: number, _minIncrement?: number, highBidder?: string | null) {
  const step = structuredIncrement(currentBid);
  if (!highBidder) return openingAsk(currentBid, step);
  return currentBid + step;
}

function nextAsk(state: Pick<AuctionClock, "currentBid" | "highBidder">) {
  return nextLiveAmount(state.currentBid, undefined, state.highBidder);
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

function placedAtOf(row: AbsenteeMax) {
  return row.placedAt ?? Number.MAX_SAFE_INTEGER;
}

function upsertAbsentee(list: AbsenteeMax[], bidder: string, max: number, placedAt: number) {
  const prior = list.find((row) => row.bidder === bidder);
  const next = list.filter((row) => row.bidder !== bidder);
  const sameMax = prior && prior.max === max;
  next.push({ bidder, max, placedAt: sameMax ? placedAtOf(prior) : placedAt });
  return next;
}

function bestChallenger(state: AuctionClock) {
  const floor = nextAsk(state);
  const challengers = state.absentees
    .filter((row) => row.bidder !== state.highBidder && row.max >= floor)
    .sort((a, b) => b.max - a.max || placedAtOf(a) - placedAtOf(b) || a.bidder.localeCompare(b.bidder));
  return challengers[0] ?? null;
}

function holderOf(state: AuctionClock) {
  if (!state.highBidder) return null;
  return state.absentees.find((row) => row.bidder === state.highBidder) ?? null;
}

function runProxy(state: AuctionClock, events: BidEvent[]) {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const challenger = bestChallenger(state);
    if (!challenger) break;
    const amount = nextAsk(state);
    if (amount > challenger.max) break;
    const holder = holderOf(state);
    if (
      holder &&
      challenger.max === holder.max &&
      placedAtOf(challenger) > placedAtOf(holder) &&
      amount >= holder.max
    ) {
      if (state.currentBid < holder.max) {
        state.currentBid = holder.max;
        state.highBidder = holder.bidder;
        events.push({ bidder: holder.bidder, amount: holder.max, kind: "absentee" });
      }
      break;
    }
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
  const minimum = nextAsk(state);
  if (amount < minimum) {
    throw new Error(`Next paddle is ${minimum}. Try that amount.`);
  }

  const events: BidEvent[] = [{ bidder, amount, kind: "live" }];
  state.currentBid = amount;
  state.highBidder = bidder;
  const snipe = extendIfSniping(state.endsAt, now);
  state.endsAt = snipe.endsAt;
  runProxy(state, events);
  const afterProxy = extendIfSniping(state.endsAt, now);
  state.endsAt = afterProxy.endsAt;

  return { state, events: uniqueTapeEvents(events), extended: snipe.extended || afterProxy.extended };
}

function uniqueTapeEvents(events: BidEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.bidder}|${event.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function placeAbsenteeMax(
  state: AuctionClock,
  bidder: string,
  maxAmount: number,
  now = Date.now(),
) {
  const minimum = nextAsk(state);
  if (maxAmount < minimum) {
    throw new Error(`A max bid has to be at least ${minimum}.`);
  }

  state.absentees = upsertAbsentee(state.absentees, bidder, maxAmount, now);
  const events: BidEvent[] = [];
  const opening = nextAsk(state);
  const mine = state.absentees.find((row) => row.bidder === bidder);
  const earlierTie = state.absentees
    .filter(
      (row) =>
        row.bidder !== bidder &&
        row.max === maxAmount &&
        placedAtOf(row) < placedAtOf(mine ?? { bidder, max: maxAmount, placedAt: now }),
    )
    .sort((a, b) => placedAtOf(a) - placedAtOf(b))[0];
  if (earlierTie && opening >= earlierTie.max) {
    if (state.currentBid < earlierTie.max || state.highBidder !== earlierTie.bidder) {
      state.currentBid = earlierTie.max;
      state.highBidder = earlierTie.bidder;
      events.push({ bidder: earlierTie.bidder, amount: earlierTie.max, kind: "absentee" });
    }
  } else if (opening <= maxAmount) {
    state.currentBid = opening;
    state.highBidder = bidder;
    events.push({ bidder, amount: opening, kind: "absentee" });
  }

  const snipe = extendIfSniping(state.endsAt, now);
  state.endsAt = snipe.endsAt;
  runProxy(state, events);
  const afterProxy = extendIfSniping(state.endsAt, now);
  state.endsAt = afterProxy.endsAt;

  return { state, events: uniqueTapeEvents(events), extended: snipe.extended || afterProxy.extended };
}
