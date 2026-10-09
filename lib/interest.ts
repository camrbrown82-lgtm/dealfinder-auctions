import type { AuctionLot } from "@/lib/utils";

export type InterestProfile = {
  categories: string[];
  consignors: string[];
  keywords: string[];
  lotIds: string[];
  searches: string[];
};

const STORAGE_KEY = "df_interest";
const COOKIE_KEY = "df_interest";
const LIMIT = 24;

const empty = (): InterestProfile => ({
  categories: [],
  consignors: [],
  keywords: [],
  lotIds: [],
  searches: [],
});

function remember(list: string[], value: string) {
  const next = value.trim().toLowerCase();
  if (!next) return list;
  return [next, ...list.filter((item) => item !== next)].slice(0, LIMIT);
}

function keywordsFromTitle(title: string) {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

export function readInterest(): InterestProfile {
  if (typeof window === "undefined") return empty();
  try {
    const fromStore = window.localStorage.getItem(STORAGE_KEY);
    if (fromStore) {
      const parsed = JSON.parse(fromStore);
      return { ...empty(), ...parsed, searches: parsed.searches ?? [] };
    }
  } catch {
    /* ignore */
  }
  try {
    const match = document.cookie.match(/(?:^|; )df_interest=([^;]*)/);
    if (match?.[1]) {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      return { ...empty(), ...parsed, searches: parsed.searches ?? [] };
    }
  } catch {
    /* ignore */
  }
  return empty();
}

export function writeInterest(profile: InterestProfile) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(profile);
  try {
    window.localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(payload)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function recordInterest(lot: Pick<AuctionLot, "id" | "title" | "category" | "consignor">) {
  const current = readInterest();
  const next: InterestProfile = {
    categories: remember(current.categories, lot.category),
    consignors: remember(current.consignors, lot.consignor),
    keywords: [...keywordsFromTitle(lot.title), ...current.keywords]
      .filter((word, index, list) => list.indexOf(word) === index)
      .slice(0, LIMIT),
    lotIds: remember(current.lotIds, lot.id),
    searches: current.searches ?? [],
  };
  writeInterest(next);
  return next;
}

export function mergeWinsIntoInterest(wins: Array<{ lotId?: string; title?: string }>) {
  const current = readInterest();
  let next = current;
  for (const win of wins) {
    if (win.lotId) next = { ...next, lotIds: remember(next.lotIds, win.lotId) };
    if (win.title) {
      next = {
        ...next,
        keywords: [...keywordsFromTitle(win.title), ...next.keywords]
          .filter((word, index, list) => list.indexOf(word) === index)
          .slice(0, LIMIT),
      };
    }
  }
  writeInterest(next);
  return next;
}

export function interestScore(lot: AuctionLot, profile: InterestProfile) {
  let score = 0;
  if (profile.lotIds.includes(lot.id.toLowerCase())) score += 8;
  if (profile.categories.includes(lot.category.toLowerCase())) score += 5;
  if (profile.consignors.includes(lot.consignor.toLowerCase())) score += 4;
  const words = keywordsFromTitle(lot.title);
  for (const word of words) {
    if (profile.keywords.includes(word)) score += 2;
  }
  return score;
}

export function rankLotsByInterest(lots: AuctionLot[], profile: InterestProfile) {
  return [...lots].sort((a, b) => interestScore(b, profile) - interestScore(a, profile));
}

export function recordSearch(query: string) {
  const current = readInterest();
  const next = { ...current, searches: remember(current.searches ?? [], query) };
  writeInterest(next);
  return next;
}

export function rememberLotIds(ids: string[]) {
  const current = readInterest();
  let lotIds = current.lotIds;
  for (const id of ids) lotIds = remember(lotIds, id);
  const next = { ...current, lotIds };
  writeInterest(next);
  return next;
}

function endMs(lot: AuctionLot) {
  const ms = new Date(lot.endsAt).getTime();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

function lotHaystack(lot: AuctionLot) {
  return [lot.title, lot.description, lot.consignor, lot.lotNumber, lot.auctionNumber, lot.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isPersonalLot(lot: AuctionLot, profile: InterestProfile, query = "") {
  const id = lot.id.toLowerCase();
  if ((profile.lotIds ?? []).some((row) => row === id)) return true;
  const haystack = lotHaystack(lot);
  const q = query.trim().toLowerCase();
  if (q && haystack.includes(q)) return true;
  return (profile.searches ?? []).some((search) => search && haystack.includes(search));
}

/** Soonest close first. Caller includes searches, bids, and purchases in the same list. */
export function orderLotsForFloor(lots: AuctionLot[]) {
  return [...lots].sort((a, b) => endMs(a) - endMs(b) || a.title.localeCompare(b.title));
}
