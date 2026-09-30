import Link from "next/link";
import { GoogleRatingLink } from "@/components/GoogleRatingLink";
import { SocialLinks } from "@/components/SocialLinks";
import { SERVICE_CITIES } from "@/lib/locations";
import { SITE } from "@/lib/site";

const heading = "mb-3 font-display text-sm font-bold uppercase tracking-wider text-white";
const link =
  "font-comic text-sm font-bold leading-6 underline decoration-2 underline-offset-2 hover:text-white";

export function SiteFooter() {
  return (
    <footer className="max-w-full overflow-x-clip border-t-4 border-brand-ink bg-brand-red text-brand-cream">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-3xl leading-none text-white pop-shadow">DealFinder Auctions</p>
            <p className="mt-3 font-comic text-sm font-bold leading-6">{SITE.tagline}</p>
          </div>

          <nav aria-label="Cities">
            <p className={heading}>Bid from</p>
            <ul className="space-y-1">
              <li>
                <Link href="/locations" className={link}>
                  All cities
                </Link>
              </li>
              {SERVICE_CITIES.map((city) => (
                <li key={city.slug}>
                  <Link href={`/locations/${city.slug}`} className={link}>
                    {city.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-8">
            <div>
              <p className={heading}>Visit</p>
              <a href={SITE.mapsUrl} target="_blank" rel="noreferrer" className={`block ${link}`}>
                {SITE.addressLine}
                <br />
                {SITE.cityLine}
              </a>
            </div>
            <div>
              <p className={heading}>Contact</p>
              <a href={SITE.phoneHref} className={`block ${link}`}>
                {SITE.phoneDisplay}
              </a>
              <a href={`mailto:${SITE.email}`} className={`mt-1 block break-words ${link}`}>
                {SITE.email}
              </a>
            </div>
          </div>

          <div className="min-w-0">
            <p className={heading}>Follow us on social</p>
            <SocialLinks />
            <GoogleRatingLink className="mt-4 w-full max-w-full" />
          </div>
        </div>
      </div>
    </footer>
  );
}
