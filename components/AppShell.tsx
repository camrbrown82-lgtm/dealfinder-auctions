"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const landing = pathname === "/";

  if (landing) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="print:hidden">
        <AppHeader />
      </div>
      <main className="mx-auto w-full min-w-0 max-w-[90rem] flex-1 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-8">
        {children}
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </>
  );
}
