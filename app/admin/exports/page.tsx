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
          export (sold lots, buyers, pre-auth) lives on Auction desk. Settlements can download as
          grouped buyer invoices or itemized lot lines. Master reports include lot status, consignor
          payouts, 15% premium, 5% GST, and $10 shipping handling.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="comic-btn" href="/api/admin/export?view=grouped">
            House workbook · grouped invoices
          </a>
          <a className="comic-btn-invert" href="/api/admin/export?view=itemized">
            House workbook · itemized sales
          </a>
          <a className="comic-btn-invert" href="/admin/auctions">
            Per-auction .xlsx / master report
          </a>
          <a className="comic-btn-invert" href="/admin/settlements">
            Settlements hub
          </a>
        </div>
      </div>
    </AdminShell>
  );
}
