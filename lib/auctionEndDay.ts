export const HOUSE_TIME_ZONE = "America/Edmonton";
export const SUNDAY_HAMMER_HOUR = 18;

function houseParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOUSE_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour") || "0"),
  };
}

export function houseDateKey(now = new Date()) {
  const parts = houseParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Sunday 3:00–3:59 p.m. America/Edmonton — about three hours before the 6 p.m. hammer. */
export function isOutbidClosingWindow(now = new Date()) {
  const parts = houseParts(now);
  return parts.weekday === "Sun" && parts.hour === 15;
}

/** Sunday 10:00 through 17:59 America/Edmonton — 10 a.m. Mountain, before the 6 p.m. hammer. */
export function isSundayBidReminderWindow(now = new Date()) {
  const parts = houseParts(now);
  return parts.weekday === "Sun" && parts.hour >= 10 && parts.hour < SUNDAY_HAMMER_HOUR;
}

export function isAuctionEndDay(now = new Date()) {
  return houseParts(now).weekday === "Sun";
}

export function isPastSundayHammer(now = new Date()) {
  const parts = houseParts(now);
  return parts.weekday === "Sun" && parts.hour >= SUNDAY_HAMMER_HOUR;
}

export function auctionEndDayLabel() {
  return "Sunday";
}

export function lotEndsOnAuctionDay(endsAt: string, now = new Date()) {
  if (!isAuctionEndDay(now)) return false;
  const end = houseParts(new Date(endsAt));
  const today = houseParts(now);
  return end.year === today.year && end.month === today.month && end.day === today.day;
}
