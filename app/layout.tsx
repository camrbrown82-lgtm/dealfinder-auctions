import type { Metadata } from "next";
import Script from "next/script";
import { Bangers, Comic_Neue } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { BidderProvider } from "@/components/BidderProvider";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import { SITE_DESCRIPTION, SITE_ORIGIN, SITE_TITLE, pageMetadata } from "@/lib/seo";
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
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE.name,
  ...pageMetadata({ path: "/" }),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE.name}`,
  },
  description: SITE_DESCRIPTION,
  icons: { icon: "/logo.webp", apple: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bangers.variable} ${comicNeue.variable}`}>
        <JsonLd />
        <Script
          src={
            process.env.NEXT_PUBLIC_HELCIM_PAY_JS ||
            "https://secure.helcim.app/helcim-pay/services/start.js"
          }
          strategy="afterInteractive"
        />
        <BidderProvider>
          <div className="flex min-h-screen max-w-full flex-col overflow-x-clip">
            <AppShell>{children}</AppShell>
          </div>
        </BidderProvider>
      </body>
    </html>
  );
}
