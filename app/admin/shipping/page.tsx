"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { ShippingDesk } from "@/components/admin/ShippingDesk";

export default function AdminShippingPage() {
  return (
    <AdminShell
      title="Shipping desk"
      subtitle="Paid shipments land here. Pick a settlement, weigh the box, quote Canada Post, and print the label."
    >
      <ShippingDesk />
    </AdminShell>
  );
}
