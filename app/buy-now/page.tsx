import type { Metadata } from "next";
import { BuyNowStore } from "@/components/BuyNowStore";
import { fetchBuyNowLots } from "@/lib/lots";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Buy Now",
  description:
    "Shop DealFinder Auctions Buy Now lots in Airdrie, AB. Pay immediately with Helcim and pick up at 529 Gateway Rd NE.",
  path: "/buy-now",
});

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function BuyNowPage() {
  const lots = await fetchBuyNowLots();
  return <BuyNowStore lots={lots} />;
}
