"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettlementBook } from "@/components/admin/SettlementBook";
import type { CustomerRow } from "@/lib/adminTypes";
import { buildAuctionSettlements } from "@/lib/settlements";

type HubLens = "all" | "house" | "consignor";

export default function AdminSettlementsPage() {
  const desk = useAdminDesk();
  const { data } = desk;
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [lens, setLens] = useState<HubLens>("all");

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
      title="Settlements hub"
      subtitle="Buyer invoices and consignor payouts in one place. Switch the batch filter as needed."
    >
      <div className="flex flex-wrap gap-2 print:hidden">
        {(
          [
            ["all", "All batches"],
            ["house", "House / buyer invoices"],
            ["consignor", "Consignor payouts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={lens === id ? "comic-btn" : "comic-btn-invert"}
            onClick={() => setLens(id)}
          >
            {label}
          </button>
        ))}
        <a className="comic-btn-invert" href="/admin/exports">
          Excel exports
        </a>
      </div>
      <SettlementBook
        lens={lens}
        sales={sales}
        payouts={data.payouts}
        payoutItems={data.payoutItems}
        onArchived={() => void desk.load()}
      />
    </AdminShell>
  );
}
