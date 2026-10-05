"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { ShippingDesk } from "@/components/admin/ShippingDesk";

export default function AdminShippingPage() {
  return (
    <AdminShell
      title="Pickup & shipping"
      subtitle="Open wins are closed lots with no delivery choice yet. The moment a buyer picks shipping or pickup, the invoice moves to that desk and leaves the others."
    >
      <ShippingDesk />
    </AdminShell>
  );
}
