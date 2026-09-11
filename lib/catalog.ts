import type { Lot, ProfileFields } from "./types";

export const HOUSE_COMMISSION = 0.2;
export const ANTI_SNIPE_MS = 2 * 60 * 1000;
export const CONTACT_EMAIL = "dealfinderauctions@gmail.com";
export const CONTACT_PHONE = "+1 403-512-3220";
export const CONTACT_PHONE_TEL = "+14035123220";
export const ADDRESS_LINE = "529 Gateway Rd NE";
export const ADDRESS_CITY = "Airdrie, AB T4B 0J6";
export const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=529+Gateway+Rd+NE%2C+Airdrie+AB+T4B+0J6";

export const INTERAC_EMAIL =
  process.env.NEXT_PUBLIC_INTERAC_EMAIL || "payments@dealfinder.auctions";

export const PICKUP_INSTRUCTIONS =
  process.env.NEXT_PUBLIC_PICKUP_INSTRUCTIONS ||
  "DealFinder Auctions desk — pay on arrival with cash, debit, or in-person credit. Bring photo ID that matches your bidder profile. Pickup window: weekdays 10:00–18:00.";

export function money(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function splitCommission(amount: number, rate = HOUSE_COMMISSION) {
  const house = Math.round(amount * rate);
  return { house, consignor: Math.max(0, Math.round(amount - house)) };
}

export function lotImages(lot: Pick<Lot, "image" | "images">) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [lot.image, ...(lot.images ?? [])]) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function parseImageUrls(raw: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      seen.add(value);
      out.push(value);
    } catch {
      /* skip */
    }
  }
  return out.slice(0, 4);
}

export function countdown(endsAt: string, now = Date.now()) {
  const remaining = new Date(endsAt).getTime() - now;
  if (remaining <= 0) return "ENDED";
  const total = Math.floor(remaining / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function isLive(lot: Pick<Lot, "endsAt" | "status">, now = Date.now()) {
  return lot.status !== "paused" && lot.status !== "ended" && lot.status !== "sold" && lot.status !== "removed" && new Date(lot.endsAt).getTime() > now;
}

export function filterLiveLots(lots: Lot[], query: string) {
  const visible = lots.filter(
    (lot) =>
      lot.status !== "paused" &&
      lot.status !== "draft" &&
      lot.status !== "ended" &&
      lot.status !== "sold" &&
      lot.status !== "removed" &&
      lot.status !== "pending_approval",
  );
  const q = query.trim().toLowerCase();
  if (!q) return visible;
  return visible.filter((lot) =>
    [lot.title, lot.description, lot.category, lot.consignor, lot.lotNumber, lot.auctionNumber, lot.id, lot.slug]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

export function statusLabel(status: string) {
  if (status === "pending_approval") return "Pending approval";
  if (status === "live") return "Live auction";
  if (status === "sold") return "Sold";
  return status.replaceAll("_", " ");
}

export function paymentLabel(method: string) {
  return method === "interac_etransfer" ? "Interac e-Transfer" : "Pay on Arrival / Local Pickup";
}

export function emptyProfile(): ProfileFields {
  return {
    fullName: "",
    phone: "",
    street: "",
    city: "",
    province: "ON",
    postalCode: "",
    paymentMethod: "interac_etransfer",
  };
}

export function profileComplete(profile: ProfileFields) {
  return Boolean(
    profile.fullName.trim() &&
      profile.phone.trim() &&
      profile.street.trim() &&
      profile.city.trim() &&
      profile.province.trim() &&
      profile.postalCode.trim() &&
      profile.paymentMethod,
  );
}

export function invoiceNumber(lot: Pick<Lot, "lotNumber" | "auctionNumber">) {
  return `INV-${lot.auctionNumber.replace(/\D/g, "")}-${lot.lotNumber.replace(/\D/g, "")}`;
}
