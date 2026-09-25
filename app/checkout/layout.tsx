import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Checkout",
  description:
    "Pay winning DealFinder Auctions lots by Helcim card. Invoices and pickup details for the Airdrie, AB desk at 529 Gateway Rd NE.",
  path: "/checkout",
  index: false,
});

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
