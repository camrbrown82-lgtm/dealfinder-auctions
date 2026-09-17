"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RelistLotsModal } from "@/components/admin/RelistLotsModal";
import { formatCurrency, type AuctionEvent, type PayoutRow } from "@/lib/utils";
import { paymentMethodLabel, fulfillmentLabel } from "@/lib/payments";
import {
  itemizeAuctionSettlements,
  mergePersistedInvoices,
  type AuctionSettlement,
  type BuyerSettlement,
} from "@/lib/settlements";
import { salesViewLabel, type SalesViewMode } from "@/lib/salesView";
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
  lens = "all",
  events = [],
  onRelistLots,
  onDeleteLots,
}: {
  sales: AuctionSettlement[];
  payouts: PayoutRow[];
  payoutItems?: PayoutItem[];
  onArchived?: () => Promise<void> | void;
  lens?: "all" | "house" | "consignor";
  events?: AuctionEvent[];
  onRelistLots?: (lotIds: string[], eventId: string, lotStart: string) => Promise<void> | void;
  onDeleteLots?: (lotIds: string[]) => Promise<void> | void;
}) {
  const [marks, setMarks] = useState<Record<string, InvoiceMark>>({});
  const [savedInvoices, setSavedInvoices] = useState<SettlementInvoiceRecord[]>([]);
  const [archives, setArchives] = useState<SettlementArchiveRecord[]>([]);
  const [printId, setPrintId] = useState<string | "all" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [salesView, setSalesView] = useState<SalesViewMode>("grouped");
  const [unsoldOnly, setUnsoldOnly] = useState(false);
  const [selectedUnsold, setSelectedUnsold] = useState<Set<string>>(new Set());
  const [relistOpen, setRelistOpen] = useState(false);
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
    const scoped = !printId || printId === "all" ? merged : merged.filter((sale) => sale.eventId === printId);
    return salesView === "itemized" ? itemizeAuctionSettlements(scoped) : scoped;
  }, [printId, sales, savedInvoices, salesView]);

  return (
    <>
    <div className="space-y-10">
      {lens !== "consignor" ? (
        <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className="comic-btn" onClick={() => setPrintId("all")}>
          Print all auctions
        </button>
        <a className="comic-btn-invert" href={`/api/admin/export?view=${salesView}`}>
          Excel · {salesViewLabel(salesView)}
        </a>
        <button
          type="button"
          className={salesView === "itemized" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => setSalesView("itemized")}
        >
          Itemized Sales View
        </button>
        <button
          type="button"
          className={salesView === "grouped" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => setSalesView("grouped")}
        >
          Grouped Buyer Invoice View
        </button>
        <button
          type="button"
          className={unsoldOnly ? "comic-btn" : "comic-btn-invert"}
          onClick={() => setUnsoldOnly((value) => !value)}
        >
          Unsold / No-bid items
        </button>
        <button
          type="button"
          className="comic-btn"
          disabled={!selectedUnsold.size || !onRelistLots}
          onClick={() => setRelistOpen(true)}
        >
          Relist / Repost selected ({selectedUnsold.size})
        </button>
        <button
          type="button"
          className="comic-btn-invert"
          disabled={!selectedUnsold.size || !onDeleteLots}
          onClick={() => void onDeleteLots?.(Array.from(selectedUnsold))}
        >
          Delete selected lots
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
            unsoldOnly={unsoldOnly}
            selectedUnsold={selectedUnsold}
            onToggleUnsold={(id, checked) => {
              setSelectedUnsold((current) => {
                const next = new Set(current);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
            onToggleUnsoldGroup={(ids, checked) => {
              setSelectedUnsold((current) => {
                const next = new Set(current);
                for (const id of ids) {
                  if (checked) next.add(id);
                  else next.delete(id);
                }
                return next;
              });
            }}
            onDeleteLot={(id) => void onDeleteLots?.([id])}
            onMark={(buyer, next, delay) => patchMark(sale, buyer, next, delay)}
            onPrint={() => setPrintId(sale.eventId)}
            onSave={() => void saveSale(sale)}
          />
        ))
      )}
        </>
      ) : null}

      {lens !== "house" ? (
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
      ) : null}

      {lens !== "consignor" ? (
      <section className="space-y-3 print:hidden">
        <h2 className="font-display text-3xl">Saved auction records</h2>
        <p className="font-comic text-sm">
          Open the dedicated auction desk for stats, paddles, Sunday pre-auth status, and Excel
          export — one sale at a time.
        </p>
        <a className="comic-btn inline-block" href="/admin/auctions">
          Open saved auctions
        </a>
        {archives.length === 0 ? (
          <p className="comic-panel-sm p-3 font-comic text-sm">
            Save an auction from a printed settlement to keep a snapshot in Supabase.
          </p>
        ) : (
          <ul className="space-y-2">
            {archives.slice(0, 6).map((row) => (
              <li key={`${row.eventId}-${row.savedAt}`} className="comic-panel-sm p-3">
                <p className="font-display text-xl">
                  {row.auctionNumber} · {row.name}
                </p>
                <p className="font-comic text-sm">
                  Saved {new Date(row.savedAt).toLocaleString()} · {row.snapshot.invoices.length} invoices
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}
    </div>
    <RelistLotsModal
      open={relistOpen}
      count={selectedUnsold.size}
      events={events}
      onClose={() => setRelistOpen(false)}
      onConfirm={(eventId, lotStart) => {
        void Promise.resolve(onRelistLots?.(Array.from(selectedUnsold), eventId, lotStart)).then(() => {
          setRelistOpen(false);
          setSelectedUnsold(new Set());
        });
      }}
    />
    </>
  );
}

function AuctionBlock({
  sale,
  marks,
  saving,
  unsoldOnly,
  selectedUnsold,
  onToggleUnsold,
  onToggleUnsoldGroup,
  onDeleteLot,
  onMark,
  onPrint,
  onSave,
}: {
  sale: AuctionSettlement;
  marks: Record<string, InvoiceMark>;
  saving: boolean;
  unsoldOnly: boolean;
  selectedUnsold: Set<string>;
  onToggleUnsold: (id: string, checked: boolean) => void;
  onToggleUnsoldGroup: (ids: string[], checked: boolean) => void;
  onDeleteLot?: (id: string) => void;
  onMark: (buyer: BuyerSettlement, next: InvoiceMark, delay?: number) => void;
  onPrint: () => void;
  onSave: () => void;
}) {
  const hammer = sale.invoices.reduce((sum, row) => sum + row.total, 0);
  const unsoldIds = sale.unsold.map((lot) => lot.id);
  const allUnsoldSelected = unsoldIds.length > 0 && unsoldIds.every((id) => selectedUnsold.has(id));
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

      {unsoldOnly ? null : (
        sale.invoices.map((invoice) => (
          <InvoiceCard
            key={`${invoice.invoice}-${invoice.lots.map((lot) => lot.id).join(",")}`}
            invoice={invoice}
            mark={marks[invoice.invoice] ?? emptyMark()}
            onMark={(next, delay) => onMark(invoice, next, delay)}
          />
        ))
      )}

      {sale.unsold.length > 0 ? (
        <div className="comic-panel p-4 print:hidden">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl">Unsold / no-bid items</h3>
            <label className="font-comic text-sm font-bold">
              <input
                type="checkbox"
                className="mr-2"
                checked={allUnsoldSelected}
                onChange={(e) => onToggleUnsoldGroup(unsoldIds, e.target.checked)}
              />
              Select all
            </label>
          </div>
          <div className="comic-table-wrap">
            <table className="w-full min-w-[640px] border-collapse font-comic text-sm">
              <thead className="bg-black text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-2 w-10" />
                  <th className="border-b-4 border-black p-2">Lot</th>
                  <th className="border-b-4 border-black p-2">Item</th>
                  <th className="border-b-4 border-black p-2">Status</th>
                  <th className="border-b-4 border-black p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sale.unsold.map((lot) => (
                  <tr key={lot.id} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-2">
                      <input
                        type="checkbox"
                        checked={selectedUnsold.has(lot.id)}
                        onChange={(e) => onToggleUnsold(lot.id, e.target.checked)}
                        aria-label={`Select ${lot.lotNumber ?? lot.title}`}
                      />
                    </td>
                    <td className="border-b-2 border-black p-2">{lot.lotNumber ?? "—"}</td>
                    <td className="border-b-2 border-black p-2">{lot.title}</td>
                    <td className="border-b-2 border-black p-2">{(lot.status ?? "ended").toUpperCase()}</td>
                    <td className="border-b-2 border-black p-2">
                      <button
                        type="button"
                        className="comic-btn !px-2 !py-1 !text-sm"
                        onClick={() => onDeleteLot?.(lot.id)}
                      >
                        Delete lot
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : unsoldOnly ? (
        <p className="comic-panel-sm p-3 font-comic text-sm print:hidden">No unsold lots in this sale.</p>
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
