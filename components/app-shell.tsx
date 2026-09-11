"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ADDRESS_CITY,
  ADDRESS_LINE,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_TEL,
  MAPS_URL,
} from "@/lib/catalog";
import { useBidder } from "./bidder-provider";

const navLink =
  "font-display text-lg uppercase tracking-wide text-brand-cream [text-shadow:2px_2px_0_#000,-1px_-1px_0_#000] hover:text-white sm:text-xl";

function Header() {
  const { user, logout, requestAuth } = useBidder();
  return (
    <header className="relative w-full border-b-4 border-brand-ink bg-black">
      <div className="relative h-36 w-full sm:h-44 md:h-52 lg:h-60">
        <Link href="/" className="absolute inset-0 block" aria-label="DealFinder Auctions home">
          <Image src="/logo.webp" alt="" fill className="object-fill" sizes="100vw" priority />
        </Link>
      </div>
      <nav className="absolute right-3 top-3 z-10 flex max-w-[min(100%,28rem)] flex-wrap items-center justify-end gap-x-3 gap-y-1 sm:right-6 sm:top-4 sm:max-w-none sm:gap-x-5">
        <Link href="/live" className={navLink}>
          Live
        </Link>
        <Link href="/consignor" className={navLink}>
          Consign
        </Link>
        {user ? (
          <>
            <Link href="/profile" className={navLink}>
              Profile
            </Link>
            <Link href="/checkout" className={navLink}>
              Checkout
            </Link>
            <button type="button" className={navLink} onClick={() => void logout()}>
              Log out
            </button>
          </>
        ) : (
          <button type="button" className={navLink} onClick={() => requestAuth(undefined, "login")}>
            Log in
          </button>
        )}
        <Link href="/admin" className={navLink}>
          Admin
        </Link>
      </nav>
    </header>
  );
}

const iconClass = "h-7 w-7 fill-current";

const social = [
  {
    key: "tiktok",
    label: "TikTok",
    href: "",
    Icon: function TikTokIcon() {
      return (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden>
          <path d="M14.5 3c.4 2.4 1.8 4.2 4.2 4.6v3.1c-1.5 0-2.9-.5-4.1-1.3v6.4c0 3.3-2.6 6-5.9 6.2-3.5.2-6.4-2.6-6.4-6.1 0-3.4 2.8-6.1 6.2-6.1.4 0 .8 0 1.2.1v3.2c-.4-.2-.8-.3-1.2-.3-1.7 0-3.1 1.4-3.1 3.1s1.4 3.1 3.1 3.1 3.1-1.4 3.1-3.1V3h2.9Z" />
        </svg>
      );
    },
  },
  {
    key: "instagram",
    label: "Instagram",
    href: "",
    Icon: function InstagramIcon() {
      return (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden>
          <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm-5 3.2A3.8 3.8 0 1 1 8.2 12 3.8 3.8 0 0 1 12 8.2Zm0 2A1.8 1.8 0 1 0 13.8 12 1.8 1.8 0 0 0 12 10.2ZM17.2 6.6a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z" />
        </svg>
      );
    },
  },
  {
    key: "facebook",
    label: "Facebook",
    href: "",
    Icon: function FacebookIcon() {
      return (
        <svg viewBox="0 0 24 24" className={iconClass} aria-hidden>
          <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1Z" />
        </svg>
      );
    },
  },
];

export function SocialRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {social.map(({ key, label, href, Icon }) => {
        const cls =
          "inline-flex h-12 w-12 items-center justify-center border-4 border-brand-ink bg-brand-cream text-brand-ink shadow-comic-sm transition hover:-translate-y-0.5 hover:bg-white";
        return href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" aria-label={`Follow DealFinder on ${label}`} className={cls}>
            <Icon />
          </a>
        ) : (
          <span key={key} title={`${label} link coming soon`} aria-label={`${label} — add your profile URL later`} className={cls}>
            <Icon />
          </span>
        );
      })}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t-4 border-brand-ink bg-brand-red text-brand-cream">
      <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-3xl text-white pop-shadow">DealFinder Auctions</p>
          <p className="mt-2 font-comic text-sm font-bold">High-Speed Timed Liquidations & Local Consignments</p>
        </div>
        <div>
          <p className="font-display text-xl text-white">Visit</p>
          <a href={MAPS_URL} target="_blank" rel="noreferrer" className="mt-2 block font-comic text-sm font-bold underline decoration-2 underline-offset-2 hover:text-white">
            {ADDRESS_LINE}
            <br />
            {ADDRESS_CITY}
          </a>
        </div>
        <div>
          <p className="font-display text-xl text-white">Contact</p>
          <a href={`tel:${CONTACT_PHONE_TEL}`} className="mt-2 block font-comic text-sm font-bold hover:text-white">
            {CONTACT_PHONE}
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="mt-1 block break-all font-comic text-sm font-bold hover:text-white">
            {CONTACT_EMAIL}
          </a>
        </div>
        <div>
          <p className="font-display text-xl text-white">Follow us on social</p>
          <p className="mt-1 font-comic text-xs font-bold">TikTok · Instagram · Facebook</p>
          <SocialRow className="mt-3" />
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return <>{children}</>;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
