import type { Metadata } from "next";
import Link from "next/link";
import { MediaGallery } from "@/components/MediaGallery";
import { listFloorClips, type FloorClip } from "@/lib/floorClips";
import { pageMetadata } from "@/lib/seo";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Media",
  description: "Photos and floor clips from DealFinder Auctions in Airdrie.",
  path: "/media",
});

async function savedClips(): Promise<FloorClip[]> {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    return await listFloorClips(supabase);
  } catch {
    return [];
  }
}

export default async function MediaPage() {
  const clips = await savedClips();
  return (
    <article className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-brand-ink">
      <header className="comic-panel w-full space-y-2 p-5 text-center">
        <h1 className="font-display text-4xl leading-none text-brand-red sm:text-5xl">Media</h1>
        <p className="font-comic text-lg">From the Airdrie floor.</p>
      </header>
      {clips.length > 0 ? (
        <div className="grid w-full gap-6 md:grid-cols-2">
          {clips.map((clip) => (
            <figure key={clip.id} id={`clip-${clip.id}`} className="comic-panel overflow-hidden bg-black p-2">
              <video src={clip.publicUrl} controls playsInline className="aspect-video w-full bg-black" />
              <figcaption className="bg-brand-cream px-3 py-2 font-display text-2xl">{clip.title}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      <MediaGallery />
      <Link href="/" className="comic-btn">
        Back home
      </Link>
    </article>
  );
}
