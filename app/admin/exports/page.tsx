"use client";

import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminExportsPage() {
  return (
    <AdminShell
      title="Excel exports"
      subtitle="Download house-wide workbooks or open Auction desk for a single-sale .xlsx."
    >
      <div className="space-y-4 comic-panel p-4">
        <p className="font-comic text-sm">
          House export covers auctions, inventory, settlements, payouts, and customers. Per-sale
          export (sold lots, buyers, pre-auth) lives on Auction desk.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="comic-btn" href="/api/admin/export">
            Export house workbook
          </a>
          <a className="comic-btn-invert" href="/admin/auctions">
            Per-auction .xlsx
          </a>
          <a className="comic-btn-invert" href="/admin/settlements">
            Settlements hub
          </a>
        </div>
      </div>
    </AdminShell>
  );
}
