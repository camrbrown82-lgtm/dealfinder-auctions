import { LotGallery } from "@/components/LotGallery";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuctionRoom } from "@/components/AuctionRoom";
import { fetchLot } from "@/lib/lots";
import { lotImages } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function AuctionLotPage({ params }: PageProps) {
  const lot = await fetchLot(params.id);
  if (!lot) notFound();

  return (
    <div className="space-y-6">
      <div className="border-4 border-black bg-[#FF0000] px-4 py-5 text-white shadow-[6px_6px_0_0_#000]">
        <Link href="/live" className="font-display text-lg text-white underline">
          ← Back to live lots
        </Link>
        <p className="mt-3 inline-block border-4 border-black bg-[#FFF7D1] px-3 py-1 font-display text-black">
          {lot.category}
        </p>
        {(lot.lotNumber || lot.auctionNumber) && (
          <p className="mt-2 font-comic text-sm">
            {lot.auctionNumber ? `Auction ${lot.auctionNumber}` : ""}
            {lot.auctionNumber && lot.lotNumber ? " · " : ""}
            {lot.lotNumber ? `Lot ${lot.lotNumber}` : ""}
          </p>
        )}
        <h1 className="mt-3 font-display text-5xl leading-none">{lot.title}</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="overflow-hidden border-4 border-black bg-[#FFF7D1] shadow-[6px_6px_0_0_#000]">
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

        <AuctionRoom lot={lot} />
      </div>
    </div>
  );
}
