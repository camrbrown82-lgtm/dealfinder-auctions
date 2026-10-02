import type { MetadataRoute } from "next";
import { SERVICE_CITIES } from "@/lib/locations";
import { SITE_ORIGIN } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_ORIGIN, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_ORIGIN}/live`, lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_ORIGIN}/buy-now`, lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_ORIGIN}/consignor`, lastModified, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_ORIGIN}/media`, lastModified, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_ORIGIN}/locations`, lastModified, changeFrequency: "weekly", priority: 0.7 },
    ...SERVICE_CITIES.map((city) => ({
      url: `${SITE_ORIGIN}/locations/${city.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
