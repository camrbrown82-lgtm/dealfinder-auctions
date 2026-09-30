import Link from "next/link";
import { GoogleRatingLink } from "@/components/GoogleRatingLink";
import { SocialLinks } from "@/components/SocialLinks";
import { SERVICE_CITIES } from "@/lib/locations";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="max-w-full overflow-x-clip border-t-4 border-brand-ink bg-brand-red text-brand-cream">
      <div className="mx-auto w-full max-w-[90rem] px-3 pt-4 sm:px-4">
        <p className="font-display text-xl text-white">Bid from</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-comic text-sm font-bold">
          <li>
            <Link href="/locations" className="underline decoration-2 underline-offset-2 hover:text-white">
              All cities
            </Link>
          </li>
          {SERVICE_CITIES.map((city) => (
            <li key={city.slug}>
              <Link
                href={`/locations/${city.slug}`}
                className="underline decoration-2 underline-offset-2 hover:text-white"
              >
                {city.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-3 py-10 sm:grid-cols-2 sm:px-4 lg:grid-cols-4">
        <div>
          <p className="font-display text-3xl text-white pop-shadow">DealFinder Auctions</p>
          <p className="mt-2 font-comic text-sm font-bold">{SITE.tagline}</p>
        </div>
        <div>
          <p className="font-display text-xl text-white">Visit</p>
          <a
            href={SITE.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block font-comic text-sm font-bold underline decoration-2 underline-offset-2 hover:text-white"
          >
            {SITE.addressLine}
            <br />
            {SITE.cityLine}
          </a>
        </div>
        <div>
          <p className="font-display text-xl text-white">Contact</p>
          <a href={SITE.phoneHref} className="mt-2 block font-comic text-sm font-bold hover:text-white">
            {SITE.phoneDisplay}
          </a>
          <a
            href={`mailto:${SITE.email}`}
            className="mt-1 block break-all font-comic text-sm font-bold hover:text-white"
          >
            {SITE.email}
          </a>
        </div>
        <div className="flex min-w-0 w-full flex-col items-start self-start gap-2">
          <p className="font-display text-xl text-white">Follow us on social</p>
          <SocialLinks />
          <GoogleRatingLink className="lg:max-w-[13rem]" />
        </div>
      </div>
    </footer>
  );
}
