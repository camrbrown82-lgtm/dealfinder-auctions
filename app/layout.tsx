import type { Metadata } from "next";
import { Bangers, Comic_Neue } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
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
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8">{children}</main>
          <footer className="border-t-4 border-brand-ink bg-brand-red text-brand-paper">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-display text-2xl">DealFinder Auctions</p>
              <p className="font-comic text-sm">
                Hammer down. Secrets stay in .env.local.
              </p>
            </div>
          </footer>
        </div>
        </BidderProvider>
      </body>
    </html>
  );
}
