"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { SettlementsDesk } from "@/components/admin/SettlementsDesk";

export default function AdminSettlementsPage() {
  return (
    <AdminShell
      title="Settlements"
      subtitle="One auction at a time. See who still owes, who needs to pick up, and who has paid. Mark cash when it comes in, including Buy Now."
    >
      <SettlementsDesk />
    </AdminShell>
  );
}
