export function publicSiteUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = (process.env.VERCEL_URL || "").trim().replace(/^https?:\/\//, "");
  if (vercel) return `https://${vercel}`;
  return "http://127.0.0.1:43173";
}
