"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency, type PayoutRow } from "@/lib/utils";
import { paymentMethodLabel, fulfillmentLabel } from "@/lib/payments";
import { mergePersistedInvoices, type AuctionSettlement, type BuyerSettlement } from "@/lib/settlements";
import type { PayoutItem } from "@/lib/payouts";
import {
  emptyMark,
  invoiceRecordFromBuyer,
  marksFromInvoices,
  type InvoiceMark,
  type PaymentMark,
  type SettlementArchiveRecord,
  type SettlementInvoiceRecord,
  type ShippingMark,
} from "@/lib/settlementRecords";

function methodLabel(value: string) {
  if (value === "helcim_card" || value === "interac_etransfer" || value === "pay_on_arrival") {
    return paymentMethodLabel("helcim_card");
  }
  return value || "Helcim card";
}

export function SettlementBook({
  sales,
  payouts,
  payoutItems,
  onArchived,
}: {
  sales: AuctionSettlement[];
  payouts: PayoutRow[];
  payoutItems?: PayoutItem[];
  onArchived?: () => Promise<void> | void;
}) {
  const [marks, setMarks] = useState<Record<string, InvoiceMark>>({});
  const [savedInvoices, setSavedInvoices] = useState<SettlementInvoiceRecord[]>([]);
  const [archives, setArchives] = useState<SettlementArchiveRecord[]>([]);
  const [printId, setPrintId] = useState<string | "all" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const noteTimers = useRef<Record<string, number>>({});

  async function loadRecords() {
    const response = await fetch("/api/admin/settlements", { credentials: "include", cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (Array.isArray(json.invoices)) {
      const rows = json.invoices as SettlementInvoiceRecord[];
      setSavedInvoices(rows);
      setMarks(marksFromInvoices(rows));
    }
    if (Array.isArray(json.archives)) {
      setArchives(json.archives as SettlementArchiveRecord[]);
    }
    if (typeof json.error === "string" && json.error) setLoadError(json.error);
    else setLoadError(null);
  }

  useEffect(() => {
    void loadRecords();
  }, [sales]);

  useEffect(() => {
    if (!printId) return;
    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [printId]);

  useEffect(() => {
    function afterPrint() {
      setPrintId(null);
    }
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  async function persist(buyer: BuyerSettlement, eventId: string, mark: InvoiceMark) {
    await fetch("/api/admin/settlements", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoiceRecordFromBuyer(eventId, buyer, mark)),
    });
  }

  function patchMark(sale: AuctionSettlement, buyer: BuyerSettlement, next: InvoiceMark, delay = 0) {
    setMarks((current) => ({ ...current, [buyer.invoice]: next }));
    const key = buyer.invoice;
    window.clearTimeout(noteTimers.current[key]);
    noteTimers.current[key] = window.setTimeout(() => {
      void persist(buyer, sale.eventId, next);
    }, delay);
  }

  async function saveSale(sale: AuctionSettlement) {
    setBusy(sale.eventId);
    const response = await fetch("/api/admin/settlements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", sale, archiveInventory: true }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return;
    if (json.archive) {
      setArchives((current) => [
        json.archive as SettlementArchiveRecord,
        ...current.filter((row) => row.eventId !== sale.eventId),
      ]);
    }
    await onArchived?.();
    await loadRecords();
  }

  const visible = useMemo(() => {
    const merged = mergePersistedInvoices(sales, savedInvoices);
    if (!printId || printId === "all") return merged;
    return merged.filter((sale) => sale.eventId === printId);
  }, [printId, sales, savedInvoices]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-2 print:hidden">
        <a className="comic-btn-invert" href="/api/admin/export">
          Export Excel / Sheets
        </a>
        <button type="button" className="comic-btn" onClick={() => setPrintId("all")}>
          Print all auctions
        </button>
      </div>
      {loadError ? (
        <p className="border-4 border-black bg-brand-red p-4 font-comic text-white print:hidden">{loadError}</p>
      ) : null}
      <p className="font-comic text-sm print:hidden">
        Payment and shipping save to Supabase. Export downloads a workbook you can open in Excel or
        import in Google Sheets (File → Import). Saving a record also archives that sale out of live
        inventory.
      </p>

      {visible.length === 0 ? (
        <p className="comic-panel p-4 font-comic">
          No sold or unsold lots yet. Buy now copies the invoice here immediately. Pulling a lot off
          live files it under unsold or settlements.
        </p>
      ) : (
        visible.map((sale) => (
          <AuctionBlock
            key={sale.eventId}
            sale={sale}
            marks={marks}
            saving={busy === sale.eventId}
            onMark={(buyer, next, delay) => patchMark(sale, buyer, next, delay)}
            onPrint={() => setPrintId(sale.eventId)}
            onSave={() => void saveSale(sale)}
          />
        ))
      )}

      <section className="space-y-3 print:hidden">
        <h2 className="font-display text-3xl">Consignor payouts</h2>
        <p className="font-comic text-sm">House take 20% on hammer. Ended lots only.</p>
        <div className="comic-table-wrap">
          <table className="w-full min-w-[640px] border-collapse font-comic">
            <thead className="bg-brand-red text-left text-white">
              <tr>
                <th className="border-b-4 border-black p-3">Consignor</th>
                <th className="border-b-4 border-black p-3">Lots</th>
                <th className="border-b-4 border-black p-3">Hammer</th>
                <th className="border-b-4 border-black p-3">House</th>
                <th className="border-b-4 border-black p-3">Payout</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((row) => (
                <tr key={row.consignor} className="bg-[#FFF7D1]">
                  <td className="border-b-2 border-black p-3">{row.consignor}</td>
                  <td className="border-b-2 border-black p-3">{row.lots}</td>
                  <td className="border-b-2 border-black p-3">{formatCurrency(row.hammer)}</td>
                  <td className="border-b-2 border-black p-3">{formatCurrency(row.house)}</td>
                  <td className="border-b-2 border-black p-3 font-bold">{formatCurrency(row.payout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(payoutItems ?? []).length > 0 && (
          <div className="overflow-x-auto border-4 border-black">
            <p className="border-b-4 border-black bg-black p-2 font-display text-xl text-white">By item</p>
            <table className="w-full min-w-[720px] border-collapse font-comic text-sm">
              <thead className="bg-[#FF0000] text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">Item</th>
                  <th className="border-b-4 border-black p-3">Consignor</th>
                  <th className="border-b-4 border-black p-3">Hammer</th>
                  <th className="border-b-4 border-black p-3">Commission</th>
                  <th className="border-b-4 border-black p-3">Payout</th>
                </tr>
              </thead>
              <tbody>
                {payoutItems?.map((row) => (
                  <tr key={row.lotId} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-3">{row.title}</td>
                    <td className="border-b-2 border-black p-3">{row.consignor}</td>
                    <td className="border-b-2 border-black p-3">{formatCurrency(row.hammer)}</td>
                    <td className="border-b-2 border-black p-3">
                      {Math.round(row.commissionRate * 100)}% · {formatCurrency(row.house)}
                    </td>
                    <td className="border-b-2 border-black p-3 font-bold">{formatCurrency(row.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 print:hidden">
        <h2 className="font-display text-3xl">Saved auction records</h2>
        {archives.length === 0 ? (
          <p className="comic-panel-sm p-3 font-comic text-sm">
            Save an auction to keep a snapshot in Supabase and pull it out of live inventory.
          </p>
        ) : (
          <ul className="space-y-2">
            {archives.map((row) => (
              <li key={`${row.eventId}-${row.savedAt}`} className="comic-panel-sm p-3">
                <p className="font-display text-xl">
                  {row.auctionNumber} · {row.name}
                </p>
                <p className="font-comic text-sm">
                  Saved {new Date(row.savedAt).toLocaleString()} · {row.snapshot.invoices.length} invoices ·{" "}
                  {formatCurrency(row.snapshot.invoices.reduce((sum, invoice) => sum + invoice.total, 0))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AuctionBlock({
  sale,
  marks,
  saving,
  onMark,
  onPrint,
  onSave,
}: {
  sale: AuctionSettlement;
  marks: Record<string, InvoiceMark>;
  saving: boolean;
  onMark: (buyer: BuyerSettlement, next: InvoiceMark, delay?: number) => void;
  onPrint: () => void;
  onSave: () => void;
}) {
  const hammer = sale.invoices.reduce((sum, row) => sum + row.total, 0);
  return (
    <section className="print-auction space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl">
            {sale.auctionNumber} · {sale.name}
          </h2>
          <p className="font-comic text-sm">
            {new Date(sale.startsAt).toLocaleString()} → {new Date(sale.endsAt).toLocaleString()} ·{" "}
            {sale.invoices.length} invoices · {formatCurrency(hammer)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" className="comic-btn" onClick={onPrint}>
            Print this auction
          </button>
          <button type="button" className="comic-btn-invert" disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "Save record"}
          </button>
        </div>
      </div>

      {sale.invoices.map((invoice) => (
        <InvoiceCard
          key={invoice.invoice}
          invoice={invoice}
          mark={marks[invoice.invoice] ?? emptyMark()}
          onMark={(next, delay) => onMark(invoice, next, delay)}
        />
      ))}

      {sale.unsold.length > 0 ? (
        <p className="comic-panel-sm p-3 font-comic text-sm print:hidden">
          Unsold in this sale: {sale.unsold.map((lot) => lot.lotNumber || lot.title).join(", ")}. Move them
          from House inventory into an upcoming auction before you archive this sale.
        </p>
      ) : null}
    </section>
  );
}

function InvoiceCard({
  invoice,
  mark,
  onMark,
}: {
  invoice: BuyerSettlement;
  mark: InvoiceMark;
  onMark: (next: InvoiceMark, delay?: number) => void;
}) {
  return (
    <article className="comic-panel break-inside-avoid p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm tracking-widest text-brand-red">{invoice.invoice}</p>
          <h3 className="font-display text-2xl">{invoice.name}</h3>
        </div>
        <p className="font-display text-2xl">{formatCurrency(invoice.total)}</p>
      </div>
      <dl className="mt-3 grid gap-1 font-comic text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold">Email</dt>
          <dd>{invoice.email || "—"}</dd>
        </div>
        <div>
          <dt className="font-bold">Phone</dt>
          <dd>{invoice.phone || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-bold">Ship / pickup address</dt>
          <dd>{invoice.address}</dd>
        </div>
        <div>
          <dt className="font-bold">Payment method</dt>
          <dd>{methodLabel(invoice.paymentMethod)}</dd>
        </div>
        <div>
          <dt className="font-bold">Winner chose</dt>
          <dd>{fulfillmentLabel(mark.fulfillment ?? "unset")}</dd>
        </div>
      </dl>
      <table className="mt-3 w-full border-collapse border-4 border-black bg-white font-comic text-sm">
        <thead>
          <tr className="bg-black text-left text-white">
            <th className="p-2">Lot</th>
            <th className="p-2">Item</th>
            <th className="p-2 text-right">Hammer</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lots.map((lot) => (
            <tr key={lot.id} className="border-t-2 border-black">
              <td className="p-2">{lot.lotNumber ?? "—"}</td>
              <td className="p-2">{lot.title}</td>
              <td className="p-2 text-right">{formatCurrency(lot.hammer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 grid gap-2 print:hidden sm:grid-cols-2">
        <label className="block font-comic text-sm font-bold">
          Payment
          <select
            value={mark.payment}
            onChange={(e) => onMark({ ...mark, payment: e.target.value as PaymentMark })}
            className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
          >
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label className="block font-comic text-sm font-bold">
          House packing status
          <select
            value={mark.shipping}
            onChange={(e) => onMark({ ...mark, shipping: e.target.value as ShippingMark })}
            className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
          >
            <option value="pending">Pending</option>
            <option value="ready">Ready</option>
            <option value="shipped">Shipped</option>
            <option value="picked_up">Picked up</option>
          </select>
        </label>
        <label className="block font-comic text-sm font-bold sm:col-span-2">
          Notes
          <input
            value={mark.notes}
            onChange={(e) => onMark({ ...mark, notes: e.target.value }, 500)}
            className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
          />
        </label>
      </div>
      <p className="mt-2 hidden font-comic text-sm print:block">
        Payment: {mark.payment} · Winner: {fulfillmentLabel(mark.fulfillment ?? "unset")} · Desk:{" "}
        {mark.shipping.replace("_", " ")}
        {mark.notes ? ` · ${mark.notes}` : ""}
      </p>
    </article>
  );
}
