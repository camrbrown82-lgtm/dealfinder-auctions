import type { Metadata } from "next";
import AuctionSchema, { auctionSchemaFromLot } from "@/components/AuctionSchema";
import { LotGallery } from "@/components/LotGallery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InterestBeacon } from "@/components/InterestBeacon";
import { AuctionRoom } from "@/components/AuctionRoom";
import { BuyNowStore } from "@/components/BuyNowStore";
import { fetchLot } from "@/lib/lots";
import { LotStarsFromLot } from "@/components/LotStars";
import { isListedBuyNow } from "@/lib/saleChannel";
import { lotImages } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const lot = await fetchLot(params.id);
  if (!lot) {
    return pageMetadata({
      title: "Lot not found",
      path: `/auctions/${params.id}`,
      index: false,
    });
  }
  const image = lotImages(lot)[0] || lot.image;
  return pageMetadata({
    title: lot.title,
    description: lot.description,
    path: `/auctions/${lot.slug || lot.id}`,
    image: image || "/logo.png",
  });
}

export default async function AuctionLotPage({ params }: PageProps) {
  const lot = await fetchLot(params.id);
  if (!lot) notFound();

  return (
    <div className="space-y-6">
      <AuctionSchema {...auctionSchemaFromLot(lot)} />
      <InterestBeacon lot={lot} />
      <div className="comic-panel px-4 py-5">
        <Link
          href="/live"
          className="font-display text-lg text-brand-red underline"
        >
          ← Back to live lots
        </Link>
        {isListedBuyNow(lot) ? (
          <Link href="/buy-now" className="ml-4 font-display text-lg text-brand-red underline">
            Buy Now
          </Link>
        ) : null}
        <p className="mt-3 inline-flex border-4 border-black bg-white px-3 py-1 font-display text-2xl shadow-comic-red-sm">
          <LotStarsFromLot lot={lot} />
        </p>
        {(lot.lotNumber || lot.auctionNumber) && (
          <p className="mt-2 font-comic text-sm">
            {lot.auctionNumber ? `Auction ${lot.auctionNumber}` : ""}
            {lot.auctionNumber && lot.lotNumber ? " · " : ""}
            {lot.lotNumber ? `Lot ${lot.lotNumber}` : ""}
          </p>
        )}
        <h1 className="mt-3 break-words font-display text-4xl leading-none text-brand-red sm:text-5xl">{lot.title}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="overflow-hidden comic-panel">
          <LotGallery
            images={lotImages(lot)}
            alt={lot.title}
            variant="room"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
          <div className="space-y-2 border-t-4 border-black p-4">
            <p className="font-comic text-lg">{lot.description}</p>
            <p className="font-comic text-sm">
              Consigned by <strong>{lot.consignor}</strong>
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {isListedBuyNow(lot) ? <BuyNowStore lots={[lot]} compact /> : null}
          <AuctionRoom lot={lot} />
        </div>
      </div>
    </div>
  );
}
