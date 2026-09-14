"use client";

import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useBidder } from "@/components/BidderProvider";

const navClass =
  "font-display text-lg uppercase tracking-wide text-brand-cream [text-shadow:2px_2px_0_#000,-1px_-1px_0_#000] hover:text-white sm:text-xl";

export function AppHeader() {
  const { user, logout, requestAuth } = useBidder();

  return (
    <header className="relative w-full border-b-4 border-brand-ink bg-black">
      <Link
        href="/admin"
        className="absolute left-2 top-2 z-30 flex items-center justify-center border-4 border-brand-cream bg-black p-1 shadow-comic-sm sm:left-4 sm:top-4"
      >
        <Logo />
      </Link>
      <div className="relative h-24 w-full sm:h-44 md:h-52 lg:h-60">
        <Link href="/" className="absolute inset-0 block" aria-label="DealFinder Auctions home">
          <Image
            src="/logo.webp"
            alt="DealFinder Auctions"
            fill
            className="object-fill"
            sizes="100vw"
            priority
          />
        </Link>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t-4 border-brand-ink px-3 py-2 sm:absolute sm:right-6 sm:top-4 sm:z-10 sm:max-w-none sm:justify-end sm:border-t-0 sm:bg-transparent sm:p-0">
        <Link href="/live" className={navClass}>
          Live
        </Link>
        <Link href="/consignor" className={navClass}>
          Consign
        </Link>
        {user ? (
          <>
            <Link href="/profile" className={navClass}>
              Profile
            </Link>
            <Link href="/checkout" className={navClass}>
              Checkout
            </Link>
            <button type="button" className={navClass} onClick={() => void logout()}>
              Log out
            </button>
          </>
        ) : (
          <button type="button" className={navClass} onClick={() => requestAuth(undefined, "login")}>
            Log in
          </button>
        )}
      </nav>
    </header>
  );
}
