import type { Metadata } from "next";
import { Bangers, Comic_Neue } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { BidderProvider } from "@/components/BidderProvider";
import "./globals.css";

const bangers = Bangers({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bangers",
});

const comicNeue = Comic_Neue({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-comic",
});

export const metadata: Metadata = {
  title: "DealFinder Auctions",
  description: "Live pop-art auctions. Consign. Bid. Boom.",
  icons: { icon: "/logo.webp" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bangers.variable} ${comicNeue.variable}`}>
        <BidderProvider>
          <div className="flex min-h-screen max-w-full flex-col overflow-x-clip">
            <AppShell>{children}</AppShell>
          </div>
        </BidderProvider>
      </body>
    </html>
  );
}
