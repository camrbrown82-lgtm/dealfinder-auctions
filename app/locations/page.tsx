import type { Metadata } from "next";
import Link from "next/link";
import { SERVICE_CITIES } from "@/lib/locations";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Auctions near Airdrie",
  description:
    "DealFinder Auctions serves Calgary, Chestermere, Cochrane, Okotoks, Red Deer, and Edmonton from the Airdrie desk at 529 Gateway Rd NE.",
  path: "/locations",
});

export default function LocationsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-brand-ink">
      <header className="comic-panel space-y-3 p-5">
        <p className="font-comic text-sm font-bold">{SITE.name}</p>
        <h1 className="font-display text-4xl leading-none text-brand-red sm:text-5xl">
          Auctions across central Alberta
        </h1>
        <p className="font-comic text-lg">
          The floor is in Airdrie at {SITE.addressLine}. Bidders and consignors in these cities use that same desk.
          There is no second auction house in each town.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link href="/" className="comic-panel block p-4 font-display text-2xl text-brand-red hover:-translate-y-0.5">
            Airdrie
            <span className="mt-1 block font-comic text-base font-bold text-brand-ink">The floor and the pickup desk</span>
          </Link>
        </li>
        {SERVICE_CITIES.map((city) => (
          <li key={city.slug}>
            <Link
              href={`/locations/${city.slug}`}
              className="comic-panel block p-4 font-display text-2xl text-brand-red hover:-translate-y-0.5"
            >
              {city.name}
              <span className="mt-1 block font-comic text-base font-bold text-brand-ink">Bid and consign from {city.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
