"use client";

import Image from "next/image";
import Link from "next/link";
import { useBidder } from "@/components/BidderProvider";

export function AppHeader() {
  const { user, logout, requestAuth } = useBidder();

  return (
    <header className="border-b-4 border-brand-ink bg-brand-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center bg-black p-1">
          <Image
            src="/logo.webp"
            alt="DealFinder Auctions"
            width={220}
            height={220}
            className="h-16 w-16 object-contain sm:h-[4.5rem] sm:w-[4.5rem]"
            priority
          />
        </Link>
        <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link href="/" className="font-display text-lg hover:text-brand-red">
            Live
          </Link>
          <Link
            href="/consignor"
            className="font-display text-lg hover:text-brand-red"
          >
            Consign
          </Link>
          {user ? (
            <>
              <Link
                href="/profile"
                className="font-display text-lg hover:text-brand-red"
              >
                Profile
              </Link>
              <Link
                href="/checkout"
                className="font-display text-lg hover:text-brand-red"
              >
                Checkout
              </Link>
              <button
                type="button"
                className="font-display text-lg hover:text-brand-red"
                onClick={() => void logout()}
              >
                Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="font-display text-lg hover:text-brand-red"
              onClick={() => requestAuth(undefined, "login")}
            >
              Log in
            </button>
          )}
          <Link
            href="/admin"
            className="font-display text-lg hover:text-brand-red"
          >
            Admin
          </Link>
        </nav>
      </div>
      <div className="halftone-bar h-2 border-t-4 border-brand-ink" />
    </header>
  );
}
