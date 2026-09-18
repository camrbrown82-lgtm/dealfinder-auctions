"use client";

import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmailEngine } from "@/components/admin/EmailEngine";

export default function AdminEmailPage() {
  const { setNotice } = useAdminDesk();
  return (
    <AdminShell
      title="Email engine"
      subtitle="Win alerts, outbid notices, and broadcast templates."
    >
      <EmailEngine onNotice={setNotice} />
    </AdminShell>
  );
}
