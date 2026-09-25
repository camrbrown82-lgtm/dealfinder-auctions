import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Bidder profile",
  description:
    "Update your DealFinder Auctions paddle, pickup address, and Helcim card on file for live bidding in Airdrie, AB.",
  path: "/profile",
  index: false,
});

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
