"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { ShippingDesk } from "@/components/admin/ShippingDesk";

export default function AdminShippingPage() {
  return (
    <AdminShell
      title="Pickup & shipping"
      subtitle="Closed wins land here with the photo, lot number, and title. Pickup stays on the pickup desk. Shipping moves over when the buyer chooses it."
    >
      <ShippingDesk />
    </AdminShell>
  );
}
