import type { AuctionLot } from "@/lib/utils";

export type InterestProfile = {
  categories: string[];
  consignors: string[];
  keywords: string[];
  lotIds: string[];
};

const STORAGE_KEY = "df_interest";
const COOKIE_KEY = "df_interest";
const LIMIT = 24;

const empty = (): InterestProfile => ({
  categories: [],
  consignors: [],
  keywords: [],
  lotIds: [],
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
    if (fromStore) return { ...empty(), ...JSON.parse(fromStore) };
  } catch {
    /* ignore */
  }
  try {
    const match = document.cookie.match(/(?:^|; )df_interest=([^;]*)/);
    if (match?.[1]) return { ...empty(), ...JSON.parse(decodeURIComponent(match[1])) };
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
