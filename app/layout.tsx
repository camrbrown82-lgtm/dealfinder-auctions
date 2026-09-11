import type { Metadata } from "next";
import { Bangers, Comic_Neue } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { BidderProvider } from "@/components/bidder-provider";
import "./globals.css";

const bangers = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bangers",
});

const comicNeue = Comic_Neue({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-comic-neue",
});

export const metadata: Metadata = {
  title: "DealFinder Auctions",
  description: "Live pop-art auctions. Consign. Bid. Boom.",
  icons: { icon: "/logo.webp" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bangers.variable} ${comicNeue.variable} flex min-h-screen flex-col`}>
        <BidderProvider>
          <div className="flex min-h-screen flex-col">
            <AppShell>{children}</AppShell>
          </div>
        </BidderProvider>
      </body>
    </html>
  );
}
