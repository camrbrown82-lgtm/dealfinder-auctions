import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-brand-ink">
      <Link
        href="/admin"
        className="absolute left-3 top-4 z-20 flex items-center justify-center border-4 border-brand-cream bg-black p-1 shadow-comic-sm"
      >
        <Logo />
      </Link>
      <section className="relative flex min-h-[calc(100vh-12rem)] flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12 text-center">
        <div className="halftone-bar absolute inset-x-0 top-0 h-3" />
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(circle, #fff7d1 1.5px, transparent 1.5px)",
            backgroundSize: "22px 22px",
          }}
        />

        <h1 className="relative mx-auto w-full max-w-6xl">
          <span className="sr-only">{SITE.name}</span>
          <span className="relative mx-auto block h-[min(42vh,22rem)] w-full max-w-5xl">
            <Image
              src="/logo.webp"
              alt="DealFinder Auctions"
              fill
              className="object-contain"
              sizes="100vw"
              priority
            />
          </span>
        </h1>

        <p className="relative mt-4 max-w-3xl font-display text-3xl uppercase leading-none text-brand-cream pop-shadow sm:text-5xl">
          The floor is live. The hammer is hot.
        </p>

        <Link
          href="/live"
          className="relative mt-10 inline-flex min-h-[4.5rem] max-w-full items-center border-4 border-brand-cream bg-brand-red px-4 py-4 text-center font-display text-3xl uppercase tracking-wide text-white shadow-comic transition hover:-translate-y-1 hover:shadow-comic-red sm:px-10 sm:text-6xl"
        >
          Enter the auction
        </Link>
      </section>

      <SiteFooter />
    </div>
  );
}
