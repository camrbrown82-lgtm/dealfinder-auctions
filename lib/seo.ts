import type { Metadata } from "next";
import { SITE } from "@/lib/site";

/** Public origin used for canonical, Open Graph, and JSON-LD. Apex redirects to www. */
export const SITE_ORIGIN = "https://www.dealfinderauctions.com";

export const SITE_TITLE = `${SITE.name} | Live Timed Sales in Airdrie, AB`;

/** ~155 characters — search snippets and social previews. */
export const SITE_DESCRIPTION =
  "DealFinder Auctions in Airdrie, AB runs live timed auctions for collectibles and local consignments. Bid or consign lots; pickup at 529 Gateway Rd NE.";

export function absoluteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized === "/" ? "/" : normalized}`;
}

function clipDescription(value: string, fallback = SITE_DESCRIPTION) {
  const text = value.replace(/\s+/g, " ").trim() || fallback;
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  const safe = cut.replace(/\s+\S*$/, "");
  return `${safe || cut}…`;
}

export function pageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  image = "/logo.png",
  index = true,
}: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  index?: boolean;
} = {}): Metadata {
  const url = absoluteUrl(path);
  const desc = clipDescription(description);
  const ogTitle = title ? `${title} | ${SITE.name}` : SITE_TITLE;
  const imageUrl = image.startsWith("http") ? image : absoluteUrl(image);

  return {
    ...(title ? { title } : {}),
    description: desc,
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "en_CA",
      url,
      siteName: SITE.name,
      title: ogTitle,
      description: desc,
      images: [{ url: imageUrl, alt: title || SITE.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: desc,
      images: [imageUrl],
    },
  };
}

export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#organization`,
        name: SITE.name,
        url: SITE_ORIGIN,
        email: SITE.email,
        telephone: SITE.phoneDisplay,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/logo.png"),
        },
        image: absoluteUrl("/logo.png"),
      },
      {
        "@type": "LocalBusiness",
        "@id": `${SITE_ORIGIN}/#localbusiness`,
        name: SITE.name,
        url: SITE_ORIGIN,
        image: absoluteUrl("/logo.png"),
        description: SITE_DESCRIPTION,
        email: SITE.email,
        telephone: SITE.phoneDisplay,
        priceRange: "$$",
        parentOrganization: { "@id": `${SITE_ORIGIN}/#organization` },
        address: {
          "@type": "PostalAddress",
          streetAddress: SITE.addressLine,
          addressLocality: "Airdrie",
          addressRegion: "AB",
          postalCode: "T4B 0J6",
          addressCountry: "CA",
        },
        areaServed: [
          { "@type": "City", name: "Airdrie" },
          { "@type": "AdministrativeArea", name: "Alberta" },
        ],
      },
    ],
  };
}
