"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettlementBook } from "@/components/admin/SettlementBook";
import type { CustomerRow } from "@/lib/adminTypes";
import { buildAuctionSettlements } from "@/lib/settlements";

export default function AdminSettlementsPage() {
  const desk = useAdminDesk();
  const { data } = desk;
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  useEffect(() => {
    void fetch("/api/admin/customers", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json.customers)) setCustomers(json.customers);
      })
      .catch(() => undefined);
  }, [data.inventory]);

  const sales = useMemo(
    () => buildAuctionSettlements(data.events, data.inventory, customers),
    [data.events, data.inventory, customers],
  );

  return (
    <AdminShell
      title="Settlements"
      subtitle="One invoice per buyer per auction. Status saves to Supabase. Export opens in Excel or Google Sheets."
    >
      <SettlementBook
        sales={sales}
        payouts={data.payouts}
        payoutItems={data.payoutItems}
        onArchived={() => void desk.load()}
      />
    </AdminShell>
  );
}
