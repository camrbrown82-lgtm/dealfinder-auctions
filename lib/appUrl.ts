export function publicAppUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`.replace(/\/$/, "");
  return "https://dealfinder-auctions.vercel.app";
}

export function lotHref(slugOrId: string) {
  return `${publicAppUrl()}/auctions/${encodeURIComponent(slugOrId)}`;
}

export function checkoutHref(lotId?: string) {
  const base = `${publicAppUrl()}/checkout`;
  if (!lotId) return base;
  return `${base}?lot=${encodeURIComponent(lotId)}`;
}
