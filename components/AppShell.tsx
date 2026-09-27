"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TurboSlothChat } from "@/components/TurboSlothChat";

function showTurboSloth(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/live" ||
    pathname.startsWith("/consignor") ||
    pathname.startsWith("/auctions/")
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const landing = pathname === "/";
  const sloth = showTurboSloth(pathname) ? <TurboSlothChat /> : null;

  if (landing) {
    return (
      <>
        {children}
        {sloth}
      </>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <AppHeader />
      </div>
      <main
        className={`mx-auto w-full min-w-0 max-w-[90rem] flex-1 overflow-x-clip py-4 sm:py-8 ${
          pathname === "/live"
            ? "pl-3 pr-[5.25rem] sm:pl-4 sm:pr-[max(1rem,calc(11rem-(100vw-min(100vw,90rem))/2))]"
            : "px-3 sm:px-4"
        }`}
      >
        {children}
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
      {sloth}
    </>
  );
}
