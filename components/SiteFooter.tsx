import { SocialLinks } from "@/components/SocialLinks";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t-4 border-brand-ink bg-brand-red text-brand-cream">
      <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
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
        <div>
          <p className="font-display text-xl text-white">Follow us on social</p>
          <p className="mt-1 font-comic text-xs font-bold">TikTok · Instagram · Facebook</p>
          <SocialLinks className="mt-3" />
        </div>
      </div>
    </footer>
  );
}
