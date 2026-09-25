import type { Metadata } from "next";
import { ConsignLink } from "@/components/ConsignLink";
import { LiveGrid } from "@/components/LiveGrid";
import { fetchLiveCatalog } from "@/lib/lots";
import { pickSaleWindow } from "@/lib/liveSales";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Live auctions",
  description:
    "Watch the DealFinder Auctions live floor in Airdrie, AB. Bid on collectibles, comics, toys, and local consignments before Sunday close.",
  path: "/live",
});

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function LiveAuctionsPage() {
  const catalog = await fetchLiveCatalog();
  const sales = pickSaleWindow(catalog.events);

  return (
    <div className="min-w-0 text-brand-black">
      <section className="mx-auto max-w-6xl pb-6 text-center">
        <h1 className="sr-only">Live auctions</h1>
        <ConsignLink className="comic-btn">Sell / Consign Item</ConsignLink>
      </section>

      <LiveGrid lots={catalog.lots} sales={sales} />
    </div>
  );
}
