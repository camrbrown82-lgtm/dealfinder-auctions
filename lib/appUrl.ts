import { SITE_ORIGIN } from "@/lib/seo";

export function isLocalAppHost(value: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

/** Public links. Production always uses www.dealfinderauctions.com, never the vercel.app host. */
export function publicAppUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (explicit && isLocalAppHost(explicit)) return explicit;

  if (process.env.VERCEL_ENV === "preview") {
    const preview = (process.env.VERCEL_URL || "").trim();
    if (preview) return `https://${preview.replace(/^https?:\/\//, "")}`.replace(/\/$/, "");
  }

  return SITE_ORIGIN;
}

export function lotHref(slugOrId: string) {
  return `${publicAppUrl()}/auctions/${encodeURIComponent(slugOrId)}`;
}

export function checkoutHref(lotId?: string) {
  const base = `${publicAppUrl()}/checkout`;
  if (!lotId) return base;
  return `${base}?lot=${encodeURIComponent(lotId)}`;
}

export function publicEmailLogoUrl() {
  return `${publicAppUrl()}/email-logo.png`;
}
