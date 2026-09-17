"use client";

import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { LiveMonitor } from "@/components/admin/LiveMonitor";

export default function AdminHomePage() {
  const { setNotice } = useAdminDesk();
  return (
    <AdminShell
      title="Live Monitor"
      subtitle="Active paddles, clocks, and bid audits. This is the staff home after login."
    >
      <LiveMonitor onNotice={setNotice} />
    </AdminShell>
  );
}
