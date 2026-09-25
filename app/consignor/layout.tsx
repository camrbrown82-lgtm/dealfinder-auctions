import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sell or consign",
  description:
    "Consign comics, toys, vinyl, and collectibles with DealFinder Auctions in Airdrie, AB. Photograph your lot, set a Buy Now, and sell on the live floor.",
  path: "/consignor",
});

export default function ConsignorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
