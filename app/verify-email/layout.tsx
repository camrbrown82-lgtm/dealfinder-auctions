import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Verify email",
  description: "Confirm your DealFinder Auctions paddle email so you can bid on the live floor.",
  path: "/verify-email",
  index: false,
});

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
