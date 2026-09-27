"use client";

import type { ReactNode } from "react";
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
  const { data, error, notice, logout } = useAdminDesk();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black pb-4 print:hidden">
        <AdminNav />
        <div className="flex items-center gap-3">
          <p className="font-comic text-xs text-black/70">Source: {data.source}</p>
          <button type="button" className="comic-btn-invert !px-3 !py-1 !text-base" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </div>
      <div className="min-w-0 space-y-6">
        <div className="print:hidden">
          <h1 className="break-words font-display text-3xl text-brand-red sm:text-5xl">{title}</h1>
          {subtitle ? <p className="font-comic text-sm">{subtitle}</p> : null}
        </div>
        {error && (
          <p className="border-4 border-black bg-brand-red p-4 font-display text-xl text-white shadow-comic-red print:hidden">
            {error}
          </p>
        )}
        {notice && <p className="comic-panel p-4 font-display text-xl print:hidden">{notice}</p>}
        {children}
      </div>
    </div>
  );
}
