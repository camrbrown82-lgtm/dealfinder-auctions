"use client";

import type { ReactNode } from "react";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="break-words font-display text-3xl text-brand-red sm:text-5xl">{title}</h1>
          {subtitle ? <p className="font-comic text-sm">{subtitle}</p> : null}
          <p className="font-comic text-xs text-black/70">Source: {data.source}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminSubnav />
          <button type="button" className="comic-btn-invert" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </div>
      {error && (
        <p className="border-4 border-black bg-brand-red p-4 font-display text-xl text-white shadow-comic-red print:hidden">
          {error}
        </p>
      )}
      {notice && (
        <p className="comic-panel p-4 font-display text-xl print:hidden">{notice}</p>
      )}
      {children}
    </div>
  );
}
