"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionDesk } from "@/components/admin/AuctionDesk";

export default function AdminAuctionsPage() {
  return (
    <AdminShell
      title="Saved auctions"
      subtitle="Create or delete sales, pick terms templates, and export one auction to Excel."
    >
      <AuctionDesk />
    </AdminShell>
  );
}
