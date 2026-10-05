"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import type { DeskNotification } from "@/app/api/admin/notifications/route";
import { formatCurrency } from "@/lib/utils";

const KIND_LABEL: Record<DeskNotification["kind"], string> = {
  consignment: "CONSIGNMENT",
  cash_invoice: "CASH APPROVAL",
  cash_bid: "CASH BIDDING",
};

function submitted(at: string | null) {
  if (!at) return "";
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString("en-CA", { timeZone: "America/Edmonton" });
}

export default function AdminNotificationsPage() {
  const { setNotice, setError } = useAdminDesk();
  const [rows, setRows] = useState<DeskNotification[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/notifications", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({}));
    setLoaded(true);
    if (!response.ok) {
      setError(typeof json.error === "string" ? json.error : "Could not load notifications.");
      return;
    }
    setRows((json.notifications ?? []) as DeskNotification[]);
  }, [setError]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(poll);
  }, [load]);

  async function decideCashInvoice(row: DeskNotification, approve: boolean) {
    if (!row.invoice) return;
    setBusy(row.id);
    const response = await fetch("/api/admin/settlements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: approve ? "approveCash" : "rejectCash", invoice: row.invoice }),
    });
    setBusy(null);
    if (!response.ok) {
      setError("Could not update that cash request.");
      return;
    }
    setNotice(approve ? `Cash accepted on ${row.invoice}.` : `Cash rejected on ${row.invoice}.`);
    await load();
  }

  async function decideCashBid(
    row: DeskNotification,
    decision: "approve_auction" | "approve_permanent" | "reject",
  ) {
    if (!row.userId || !row.eventId) return;
    setBusy(row.id);
    const response = await fetch("/api/admin/cash-auth", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: row.userId, eventId: row.eventId, decision }),
    });
    setBusy(null);
    if (!response.ok) {
      setError("Could not update that cash bidding request.");
      return;
    }
    setNotice(
      decision === "reject"
        ? `Cash bidding rejected for ${row.who}.`
        : decision === "approve_permanent"
          ? `${row.who} is now trusted for cash on every sale.`
          : `${row.who} can bid cash on ${row.title}.`,
    );
    await load();
  }

  const consignments = rows.filter((row) => row.kind === "consignment");
  const cash = rows.filter((row) => row.kind !== "consignment");

  return (
    <AdminShell
      title="Notifications"
      subtitle="Everything waiting on the desk: consignments to approve and cash requests to accept. The same alerts are emailed to the house inbox."
    >
      <div className="comic-panel p-4">
        <p className="font-comic text-sm">
          {loaded
            ? rows.length === 0
              ? "Nothing is waiting. The desk is clear."
              : `${rows.length} item${rows.length === 1 ? "" : "s"} waiting · ${consignments.length} consignment${
                  consignments.length === 1 ? "" : "s"
                } · ${cash.length} cash request${cash.length === 1 ? "" : "s"}`
            : "Loading notifications…"}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">
          Consignments waiting ({consignments.length})
        </h2>
        {consignments.length === 0 ? (
          <p className="comic-panel p-4 font-comic">No consignments are waiting for approval.</p>
        ) : (
          consignments.map((row) => (
            <article key={row.id} className="comic-panel space-y-2 p-4">
              <p className="font-display text-sm tracking-[0.2em] text-brand-red">
                {KIND_LABEL[row.kind]}
              </p>
              <p className="font-display text-2xl leading-none">{row.title}</p>
              <p className="font-comic text-sm">
                {row.who} · {row.detail}
                {row.amount > 0 ? ` · opens at ${formatCurrency(row.amount)}` : ""}
                {submitted(row.at) ? ` · submitted ${submitted(row.at)}` : ""}
              </p>
              <Link href={row.href} className="comic-btn inline-block !text-sm">
                Open consignment pipeline
              </Link>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Cash approvals waiting ({cash.length})</h2>
        {cash.length === 0 ? (
          <p className="comic-panel p-4 font-comic">No cash requests are waiting.</p>
        ) : (
          cash.map((row) => (
            <article key={row.id} className="comic-panel space-y-2 p-4">
              <p className="font-display text-sm tracking-[0.2em] text-brand-red">
                {KIND_LABEL[row.kind]}
              </p>
              <p className="font-display text-2xl leading-none">{row.title}</p>
              <p className="font-comic text-sm">
                {row.who} · {row.detail}
                {row.amount > 0 ? ` · ${formatCurrency(row.amount)} due` : ""}
                {submitted(row.at) ? ` · asked ${submitted(row.at)}` : ""}
              </p>
              {row.kind === "cash_invoice" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="comic-btn !text-sm"
                    disabled={busy === row.id}
                    onClick={() => void decideCashInvoice(row, true)}
                  >
                    Accept cash payment
                  </button>
                  <button
                    type="button"
                    className="comic-btn-invert !text-sm"
                    disabled={busy === row.id}
                    onClick={() => void decideCashInvoice(row, false)}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="comic-btn !text-sm"
                    disabled={busy === row.id}
                    onClick={() => void decideCashBid(row, "approve_auction")}
                  >
                    Approve this sale
                  </button>
                  <button
                    type="button"
                    className="comic-btn !text-sm"
                    disabled={busy === row.id}
                    onClick={() => void decideCashBid(row, "approve_permanent")}
                  >
                    Approve and trust
                  </button>
                  <button
                    type="button"
                    className="comic-btn-invert !text-sm"
                    disabled={busy === row.id}
                    onClick={() => void decideCashBid(row, "reject")}
                  >
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </AdminShell>
  );
}
