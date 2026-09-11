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
      <AppHeader />
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </>
  );
}
