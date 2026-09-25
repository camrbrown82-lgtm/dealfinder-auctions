import type { Metadata } from "next";
import { LotGallery } from "@/components/LotGallery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InterestBeacon } from "@/components/InterestBeacon";
import { AuctionRoom } from "@/components/AuctionRoom";
import { BuyNowStore } from "@/components/BuyNowStore";
import { fetchLot } from "@/lib/lots";
import { listingGradeOf } from "@/lib/listingGrade";
import { isBuyNowChannel } from "@/lib/saleChannel";
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
      <InterestBeacon lot={lot} />
      <div className="comic-panel px-4 py-5">
        <Link
          href={isBuyNowChannel(lot) ? "/buy-now" : "/live"}
          className="font-display text-lg text-brand-red underline"
        >
          {isBuyNowChannel(lot) ? "← Back to Buy Now" : "← Back to live lots"}
        </Link>
        <p className="mt-3 inline-block border-4 border-black bg-white px-3 py-1 font-display text-brand-red shadow-comic-red-sm">
          {listingGradeOf(lot)}
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
            images={[lot.image].filter(Boolean)}
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

        {isBuyNowChannel(lot) ? <BuyNowStore lots={[lot]} compact /> : <AuctionRoom lot={lot} />}
      </div>
    </div>
  );
}
