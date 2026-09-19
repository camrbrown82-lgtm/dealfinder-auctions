"use client";

import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { CashAuthDesk } from "@/components/admin/CashAuthDesk";
import { LiveMonitor } from "@/components/admin/LiveMonitor";

export default function AdminHomePage() {
  const { setNotice } = useAdminDesk();
  return (
    <AdminShell
      title="Live Monitor"
      subtitle="Active paddles, clocks, bid audits, and cash-on-pickup requests waiting on the desk."
    >
      <div className="space-y-8">
        <CashAuthDesk onNotice={setNotice} />
        <LiveMonitor onNotice={setNotice} />
      </div>
    </AdminShell>
  );
}
