"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAdminDesk } from "@/components/admin/AdminDesk";

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { data, error, notice, logout } = useAdminDesk();
  const onDesk = pathname === "/admin" || pathname === "/admin/live";

  const alerts = (
    <>
      {error && (
        <p className="border-4 border-black bg-brand-red p-4 font-display text-xl text-white shadow-comic-red print:hidden">
          {error}
        </p>
      )}
      {notice && <p className="comic-panel p-4 font-display text-xl print:hidden">{notice}</p>}
    </>
  );

  if (!onDesk) {
    return (
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/admin" className="comic-btn-invert inline-block">
            ← Admin desk
          </Link>
          <button type="button" className="comic-btn-invert !px-3 !py-1 !text-base" onClick={() => void logout()}>
            Log out
          </button>
        </div>
        <div className="print:hidden">
          <h1 className="break-words font-display text-3xl text-brand-red sm:text-5xl">{title}</h1>
          {subtitle ? <p className="font-comic text-sm">{subtitle}</p> : null}
        </div>
        {alerts}
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 print:hidden lg:w-64">
        <div className="comic-panel p-3">
          <p className="font-display text-2xl text-brand-red">Staff desk</p>
          <p className="font-comic text-xs text-black/70">Source: {data.source}</p>
        </div>
        <AdminNav />
        <div className="mt-auto comic-panel p-3">
          <p className="font-comic text-xs font-bold uppercase tracking-wide">Signed in</p>
          <p className="font-comic text-sm">Admin</p>
          <button type="button" className="comic-btn-invert mt-3 w-full" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 space-y-6">
        <div className="print:hidden">
          <h1 className="break-words font-display text-3xl text-brand-red sm:text-5xl">{title}</h1>
          {subtitle ? <p className="font-comic text-sm">{subtitle}</p> : null}
        </div>
        {alerts}
        {children}
      </div>
    </div>
  );
}
