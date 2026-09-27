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
        className="mx-auto w-full min-w-0 max-w-[90rem] flex-1 overflow-x-clip px-3 py-4 sm:px-4 sm:py-8"
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
