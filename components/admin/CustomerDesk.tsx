"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { CustomerRow } from "@/lib/adminTypes";

export function CustomerDesk({ onNotice }: { onNotice: (message: string) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");

  async function load() {
    const response = await fetch("/api/admin/customers");
    const json = await response.json();
    if (response.ok) setCustomers(json.customers ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.phone.toLowerCase().includes(q)
      );
    });
  }, [customers, query, status]);

  async function setFlag(id: string, next: "active" | "suspended") {
    const response = await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Could not update bidder.");
      return;
    }
    onNotice(next === "suspended" ? "Bidding privileges suspended." : "Paddle restored.");
    await load();
  }

  async function reset(row: CustomerRow) {
    const response = await fetch("/api/admin/customers/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, email: row.email }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Could not send reset.");
      return;
    }
    onNotice(
      json.devResetUrl
        ? `Reset email queued for ${row.email}. Demo link: ${json.devResetUrl}`
        : `Reset email sent to ${row.email}`,
    );
  }

  return (
    <section className="space-y-4">
      <div className="comic-panel p-4">
        <h2 className="font-display text-2xl text-brand-red sm:text-4xl">Customer management</h2>
        <p className="font-comic text-sm">
          Suspended paddles are blocked on Place Bid. Reset emails a one-hour password link.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone"
          className="min-w-0 w-full flex-1 border-4 border-black bg-white px-3 py-2 font-comic sm:min-w-[220px]"
        />
        {(["all", "active", "suspended"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={status === item ? "comic-btn" : "comic-btn-invert"}
            onClick={() => setStatus(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="comic-table-wrap">
        <table className="w-full min-w-[880px] border-collapse font-comic text-sm">
          <thead className="bg-[#FF0000] text-left text-white">
            <tr>
              <th className="border-b-4 border-black p-3">Bidder</th>
              <th className="border-b-4 border-black p-3">Status</th>
              <th className="border-b-4 border-black p-3">Won</th>
              <th className="border-b-4 border-black p-3">Lifetime spend</th>
              <th className="border-b-4 border-black p-3">Payment flag</th>
              <th className="border-b-4 border-black p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="bg-[#FFF7D1]">
                <td className="border-b-2 border-black p-3">
                  <p className="font-bold">{row.fullName}</p>
                  <p>{row.email}</p>
                </td>
                <td className="border-b-2 border-black p-3 uppercase">{row.status}</td>
                <td className="border-b-2 border-black p-3">{row.auctionsWon}</td>
                <td className="border-b-2 border-black p-3">{formatCurrency(row.lifetimeSpend)}</td>
                <td className="border-b-2 border-black p-3">{row.paymentFlag}</td>
                <td className="border-b-2 border-black p-3">
                  <div className="flex flex-wrap gap-2">
                    {row.status === "active" ? (
                      <button
                        type="button"
                        className="comic-btn !text-sm"
                        onClick={() => void setFlag(row.id, "suspended")}
                      >
                        Suspend Bidding Privileges
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="comic-btn-invert !text-sm"
                        onClick={() => void setFlag(row.id, "active")}
                      >
                        Restore paddle
                      </button>
                    )}
                    <button
                      type="button"
                      className="comic-btn-invert !text-sm"
                      onClick={() => void reset(row)}
                    >
                      Email password reset
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
