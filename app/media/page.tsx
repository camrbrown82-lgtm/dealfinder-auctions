import type { Metadata } from "next";
import Link from "next/link";
import { MediaGallery } from "@/components/MediaGallery";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Media",
  description: "Photos from the DealFinder Auctions floor in Airdrie.",
  path: "/media",
});

export default function MediaPage() {
  return (
    <article className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-brand-ink">
      <header className="comic-panel w-full space-y-2 p-5 text-center">
        <h1 className="font-display text-4xl leading-none text-brand-red sm:text-5xl">Media</h1>
        <p className="font-comic text-lg">From the Airdrie floor.</p>
      </header>
      <MediaGallery />
      <Link href="/" className="comic-btn">
        Back home
      </Link>
    </article>
  );
}
