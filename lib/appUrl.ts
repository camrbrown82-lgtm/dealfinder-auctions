export function isLocalAppHost(value: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

export function publicAppUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim().replace(/\/$/, "");
  const onVercel = Boolean(process.env.VERCEL);
  if (explicit && !(onVercel && isLocalAppHost(explicit))) return explicit;

  if (process.env.VERCEL_ENV === "preview") {
    const preview = (process.env.VERCEL_URL || "").trim();
    if (preview) return `https://${preview.replace(/^https?:\/\//, "")}`.replace(/\/$/, "");
  }

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

export function publicEmailLogoUrl() {
  return `${publicAppUrl()}/api/email-logo`;
}
