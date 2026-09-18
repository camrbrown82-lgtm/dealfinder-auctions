"use client";

import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { CashAuthDesk } from "@/components/admin/CashAuthDesk";
import { CustomerDesk } from "@/components/admin/CustomerDesk";

export default function AdminCustomersPage() {
  const { setNotice } = useAdminDesk();
  return (
    <AdminShell
      title="Customer directory"
      subtitle="Bidder accounts, cash bidding requests, and $50 pre-auth flags."
    >
      <div className="space-y-8">
        <CashAuthDesk onNotice={setNotice} />
        <CustomerDesk onNotice={setNotice} />
      </div>
    </AdminShell>
  );
}
