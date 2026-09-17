"use client";

import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { CustomerDesk } from "@/components/admin/CustomerDesk";

export default function AdminCustomersPage() {
  const { setNotice } = useAdminDesk();
  return (
    <AdminShell
      title="Customer directory"
      subtitle="Bidder accounts, standing, and $50 pre-auth flags."
    >
      <CustomerDesk onNotice={setNotice} />
    </AdminShell>
  );
}
