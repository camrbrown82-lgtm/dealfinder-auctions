import type { Metadata } from "next";
import Link from "next/link";
import { FEATURED_MEDIA, facebookVideoEmbed } from "@/lib/featuredMedia";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Media",
  description: "Photos and clips from the DealFinder Auctions floor in Airdrie.",
  path: "/media",
});

export default function MediaPage() {
  return (
    <article className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-brand-ink">
      <header className="comic-panel w-full space-y-2 p-5 text-center">
        <h1 className="font-display text-4xl leading-none text-brand-red sm:text-5xl">Media</h1>
        <p className="font-comic text-lg">From the Airdrie floor.</p>
      </header>
      <div className="grid w-full gap-6 md:grid-cols-3">
        {FEATURED_MEDIA.map((item) => (
          <figure key={item.id} id={item.id} className="comic-panel overflow-hidden bg-black p-2">
            <img
              src={item.image}
              alt={item.alt}
              referrerPolicy="no-referrer"
              className="mx-auto max-h-[70vh] w-full object-contain"
            />
            {item.embed === "reel" && item.href ? (
              <iframe
                title={item.alt}
                src={facebookVideoEmbed(item.href)}
                className="mt-2 aspect-[9/16] w-full"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : null}
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block bg-brand-cream px-3 py-2 text-center font-display text-xl text-brand-ink"
              >
                Open on Facebook
              </a>
            ) : null}
          </figure>
        ))}
      </div>
      <Link href="/" className="comic-btn">
        Back home
      </Link>
    </article>
  );
}
