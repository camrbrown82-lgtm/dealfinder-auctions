import { buyNowPriceOf } from "@/lib/buyNow";
import { floorClipCaption, type FloorClip } from "@/lib/floorClips";
import { listingGradeOf } from "@/lib/listingGrade";
import { SITE_ORIGIN } from "@/lib/seo";
import { lotImages, type AuctionLot } from "@/lib/utils";

export type PosterPlatform = "marketplace" | "youtube" | "facebook" | "tiktok" | "instagram";

export type PosterJob = {
  kind: "listing" | "clip";
  platform: PosterPlatform;
  title: string;
  text: string;
  price?: string;
  condition?: "new" | "used";
  category?: string;
  imageUrls?: string[];
  videoUrl?: string;
};

const PICKUP =
  "Pickup in Airdrie at 529 Gateway Rd NE. The price is the Buy Now amount. Pickup invoices add a 15% buyer's premium and 5% GST.";

function plain(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function marketplaceJob(
  lot: AuctionLot,
  draft?: { title: string; description: string; price: string },
): PosterJob {
  const title = plain(draft?.title || lot.title).slice(0, 200) || "DealFinder lot";
  const description = plain(draft?.description || lot.description || "");
  const price = Number(draft?.price ?? buyNowPriceOf(lot) ?? 0);
  const pageUrl = `${SITE_ORIGIN}/auctions/${encodeURIComponent(lot.slug || lot.id)}`;
  return {
    kind: "listing",
    platform: "marketplace",
    title,
    text: `${description} ${PICKUP} ${pageUrl}`.trim().slice(0, 5000),
    price: Number.isFinite(price) && price > 0 ? price.toFixed(2) : "",
    condition: listingGradeOf(lot) === "New" ? "new" : "used",
    category: lot.category,
    imageUrls: lotImages(lot)
      .filter((url) => /^https?:\/\//i.test(url))
      .slice(0, 10),
  };
}

export function clipJob(platform: Exclude<PosterPlatform, "marketplace">, clip: FloorClip): PosterJob {
  return {
    kind: "clip",
    platform,
    title: clip.title,
    text: floorClipCaption(clip.title),
    videoUrl: clip.publicUrl,
  };
}
