"use client";

import Image from "next/image";
import Link from "next/link";
import { useBidder } from "@/components/BidderProvider";

const navClass =
  "font-display text-lg uppercase tracking-wide text-brand-cream [text-shadow:2px_2px_0_#000,-1px_-1px_0_#000] hover:text-white sm:text-xl";

export function AppHeader() {
  const { user, logout, requestAuth } = useBidder();

  return (
    <header className="relative w-full border-b-4 border-brand-ink bg-black">
      <div className="relative h-36 w-full sm:h-44 md:h-52 lg:h-60">
        <Link href="/" className="absolute inset-0 block" aria-label="DealFinder Auctions home">
          <Image
            src="/logo.webp"
            alt=""
            fill
            className="object-fill"
            sizes="100vw"
            priority
          />
        </Link>
      </div>
      <nav className="absolute right-3 top-3 z-10 flex max-w-[min(100%,28rem)] flex-wrap items-center justify-end gap-x-3 gap-y-1 sm:right-6 sm:top-4 sm:max-w-none sm:gap-x-5">
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
        <Link href="/admin" className={navClass}>
          Admin
        </Link>
      </nav>
    </header>
  );
}
