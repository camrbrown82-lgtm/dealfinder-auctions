import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { nearbyCities, locationBySlug, SERVICE_CITIES } from "@/lib/locations";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

type PageProps = {
  params: { city: string };
};

export function generateStaticParams() {
  return SERVICE_CITIES.map((place) => ({ city: place.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const place = locationBySlug(params.city);
  if (!place) {
    return pageMetadata({
      title: "City not found",
      path: `/locations/${params.city}`,
      index: false,
    });
  }
  return pageMetadata({
    title: place.metaTitle,
    description: place.metaDescription,
    path: `/locations/${place.slug}`,
  });
}

function cityJsonLd(place: NonNullable<ReturnType<typeof locationBySlug>>) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Live auctions for ${place.name}`,
    serviceType: "Auction",
    url: absoluteUrl(`/locations/${place.slug}`),
    areaServed: {
      "@type": "City",
      name: place.name,
      addressRegion: "AB",
      addressCountry: "CA",
    },
    provider: {
      "@type": "LocalBusiness",
      name: SITE.name,
      url: absoluteUrl("/"),
      telephone: SITE.phoneDisplay,
      email: SITE.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: SITE.addressLine,
        addressLocality: "Airdrie",
        addressRegion: "AB",
        postalCode: "T4B 0J6",
        addressCountry: "CA",
      },
    },
  };
}

export default function CityLandingPage({ params }: PageProps) {
  const place = locationBySlug(params.city);
  if (!place) notFound();
  const nearby = nearbyCities(place);

  return (
    <article className="mx-auto max-w-3xl space-y-6 text-brand-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cityJsonLd(place)).replace(/</g, "\\u003c") }}
      />
      <header className="comic-panel space-y-3 p-5">
        <p className="font-comic text-sm font-bold">DealFinder Auctions · Airdrie desk</p>
        <h1 className="font-display text-4xl leading-none text-brand-red sm:text-5xl">
          Live auctions for {place.name}
        </h1>
        <p className="font-comic text-lg">{place.lead}</p>
      </header>

      <section className="comic-panel space-y-3 p-5">
        <h2 className="font-display text-3xl text-brand-red">Bid from {place.name}</h2>
        <p className="font-comic text-lg">{place.bid}</p>
        <h2 className="font-display text-3xl text-brand-red">Consign from {place.name}</h2>
        <p className="font-comic text-lg">{place.consign}</p>
        <p className="font-comic text-sm">
          Pickup is at {SITE.addressLine}, {SITE.cityLine}. The desk does not keep a second floor in {place.name}.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/live" className="comic-btn">
          Enter the auction
        </Link>
        <Link href="/consignor" className="comic-btn-invert">
          Consign a lot
        </Link>
      </div>

      <section className="comic-panel p-5">
        <h2 className="font-display text-2xl text-brand-red">Also on this floor</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          <li>
            <Link href="/" className="comic-btn-invert !px-3 !py-1 !text-base">
              Airdrie
            </Link>
          </li>
          {nearby.map((city) => (
            <li key={city.slug}>
              <Link href={`/locations/${city.slug}`} className="comic-btn-invert !px-3 !py-1 !text-base">
                {city.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/locations" className="comic-btn-invert !px-3 !py-1 !text-base">
              All cities
            </Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
