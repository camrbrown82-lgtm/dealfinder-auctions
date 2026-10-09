"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import type { CustomerRow } from "@/lib/adminTypes";
import { formatCurrency } from "@/lib/utils";
import {
  BUY_NOW_SETTLEMENT_ID,
  settlementDeskSales,
  type AuctionSettlement,
  type BuyerSettlement,
} from "@/lib/settlements";
import {
  invoiceRecordFromBuyer,
  marksFromInvoices,
  type InvoiceMark,
  type SettlementInvoiceRecord,
} from "@/lib/settlementRecords";

function endLabel(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || time <= 0) return "";
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Edmonton",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function saleLabel(sale: AuctionSettlement) {
  if (sale.eventId === BUY_NOW_SETTLEMENT_ID) return "Buy Now";
  const end = endLabel(sale.endsAt);
  const name = `${sale.auctionNumber ? `${sale.auctionNumber} · ` : ""}${sale.name}`;
  return end ? `${name} · ends ${end}` : name;
}

function owes(mark: InvoiceMark) {
  return mark.payment === "unpaid" || mark.payment === "partial" || mark.payment === "cash_pending";
}

function needsPickup(invoice: BuyerSettlement, mark: InvoiceMark) {
  const fulfillment = mark.fulfillment ?? invoice.fulfillment ?? "unset";
  return fulfillment === "pickup" && mark.shipping !== "picked_up";
}

function payLabel(mark: InvoiceMark, channel?: string) {
  if (mark.payment === "paid" && channel === "cash") return "Paid in cash";
  if (mark.payment === "paid") return "Paid";
  if (mark.payment === "cash_pending") return "Cash waiting on the desk";
  if (mark.payment === "partial") return "Partial";
  return "Unpaid";
}

export function SettlementsDesk() {
  const { data } = useAdminDesk();
  const [saved, setSaved] = useState<SettlementInvoiceRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const response = await fetch("/api/admin/settlements", { credentials: "include", cache: "no-store" });
    const json = (await response.json()) as { invoices?: SettlementInvoiceRecord[]; error?: string };
    if (!response.ok) {
      setError(json.error || "Could not load settlements.");
      return;
    }
    setSaved(json.invoices ?? []);
    setError("");
  }

  useEffect(() => {
    void load().catch(() => setError("Could not load settlements."));
    void fetch("/api/admin/customers", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((json: { customers?: CustomerRow[] }) => setCustomers(json.customers ?? []))
      .catch(() => setCustomers([]));
  }, []);

  const sales = useMemo(
    () => settlementDeskSales(data.events, data.inventory, customers, saved),
    [data.events, data.inventory, customers, saved],
  );
  const images = useMemo(() => {
    const byId = new Map<string, string>();
    for (const lot of data.inventory) {
      const src = lot.image || lot.images?.[0];
      if (src) byId.set(lot.id, src);
    }
    return byId;
  }, [data.inventory]);
  const marks = useMemo(() => marksFromInvoices(saved), [saved]);
  const channels = useMemo(() => new Map(saved.map((row) => [row.invoice, row.paymentChannel])), [saved]);
  const paidLotIds = useMemo(
    () => new Set(data.inventory.filter((lot) => lot.paidAt).map((lot) => lot.id)),
    [data.inventory],
  );

  function markFor(invoice: BuyerSettlement): InvoiceMark {
    const savedMark = marks[invoice.invoice] ?? { payment: "unpaid" as const, shipping: "pending" as const, notes: "" };
    if (savedMark.payment === "paid") return savedMark;
    const settled = invoice.lots.length > 0 && invoice.lots.every((lot) => paidLotIds.has(lot.id));
    if (!settled) return savedMark;
    return { ...savedMark, payment: "paid" };
  }

  useEffect(() => {
    if (selectedId && sales.some((sale) => sale.eventId === selectedId)) return;
    const ended = sales.find(
      (sale) => sale.eventId !== BUY_NOW_SETTLEMENT_ID && Date.parse(sale.endsAt) <= Date.now(),
    );
    setSelectedId(ended?.eventId ?? sales[0]?.eventId ?? "");
  }, [sales, selectedId]);

  const sale = sales.find((row) => row.eventId === selectedId) ?? null;
  const payReminders = sale?.invoices.filter((invoice) => owes(markFor(invoice))) ?? [];
  const pickupReminders = sale?.invoices.filter((invoice) => needsPickup(invoice, markFor(invoice))) ?? [];
  const paid = sale?.invoices.filter((invoice) => markFor(invoice).payment === "paid") ?? [];

  function recordFor(invoice: BuyerSettlement): SettlementInvoiceRecord {
    const mark = markFor(invoice);
    const eventId = sale?.eventId === BUY_NOW_SETTLEMENT_ID ? null : sale?.eventId ?? null;
    return {
      ...invoiceRecordFromBuyer(eventId ?? "", invoice, mark),
      eventId: eventId || null,
      paymentChannel: channels.get(invoice.invoice),
    };
  }

  async function markCash(invoice: BuyerSettlement) {
    if (!sale) return;
    setBusy(invoice.invoice);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/settlements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markCashPaid", record: recordFor(invoice) }),
    });
    const json = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok) {
      setError(json.error || "Could not mark this invoice paid.");
      return;
    }
    setNotice(`${invoice.name} is marked paid in cash.`);
    await load();
  }

  async function markPickedUp(invoice: BuyerSettlement) {
    setBusy(invoice.invoice);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/settlements", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...recordFor(invoice), shipping: "picked_up", fulfillment: "pickup" }),
    });
    const json = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok) {
      setError(json.error || "Could not mark this pickup.");
      return;
    }
    setNotice(`${invoice.name} is marked picked up.`);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="comic-panel flex flex-wrap items-end gap-3 p-4">
        <label className="block min-w-[16rem] flex-1 font-comic font-bold">
          Auction
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          >
            {sales.length === 0 ? <option value="">No auctions yet</option> : null}
            {sales.map((row) => (
              <option key={row.eventId} value={row.eventId}>
                {saleLabel(row)}
              </option>
            ))}
          </select>
          <span className="mt-1 block font-normal text-sm">
            Sales are listed by end date. Buy Now is its own settlement.
          </span>
        </label>
        {sale ? (
          <a className="comic-btn-invert" href={`/api/admin/settlements/export?eventId=${encodeURIComponent(sale.eventId)}`}>
            Export to Excel
          </a>
        ) : null}
      </div>

      {error ? <p className="comic-panel bg-brand-red p-3 font-comic text-white">{error}</p> : null}
      {notice ? <p className="comic-panel p-3 font-comic">{notice}</p> : null}

      {!sale ? (
        <p className="comic-panel p-4 font-comic">No settlements yet.</p>
      ) : (
        <div className="space-y-8">
          <header>
            <h2 className="font-display text-3xl">{saleLabel(sale)}</h2>
            <p className="font-comic text-sm">
              {sale.invoices.length} invoices · {payReminders.length} still to pay · {pickupReminders.length} waiting
              on pickup · {paid.length} paid
            </p>
          </header>

          <ReminderBlock
            title="Still to pay"
            empty="Nobody on this sale still owes."
            invoices={payReminders}
            markFor={markFor}
            channels={channels}
            images={images}
            busy={busy}
            onCash={markCash}
            onPickup={markPickedUp}
          />
          <ReminderBlock
            title="Pick up"
            empty="No pickups are waiting."
            invoices={pickupReminders}
            markFor={markFor}
            channels={channels}
            images={images}
            busy={busy}
            onCash={markCash}
            onPickup={markPickedUp}
          />
          <ReminderBlock
            title="Paid"
            empty="No paid invoices on this sale yet."
            invoices={paid}
            markFor={markFor}
            channels={channels}
            images={images}
            busy={busy}
            onCash={markCash}
            onPickup={markPickedUp}
          />
        </div>
      )}
    </div>
  );
}

function ReminderBlock({
  title,
  empty,
  invoices,
  markFor,
  channels,
  images,
  busy,
  onCash,
  onPickup,
}: {
  title: string;
  empty: string;
  invoices: BuyerSettlement[];
  markFor: (invoice: BuyerSettlement) => InvoiceMark;
  channels: Map<string, string | undefined>;
  images: Map<string, string>;
  busy: string;
  onCash: (invoice: BuyerSettlement) => void;
  onPickup: (invoice: BuyerSettlement) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-2xl">{title}</h3>
      {invoices.length === 0 ? (
        <p className="comic-panel-sm p-3 font-comic text-sm">{empty}</p>
      ) : (
        invoices.map((invoice) => {
          const mark = markFor(invoice);
          const paidAlready = mark.payment === "paid";
          return (
            <article key={`${title}-${invoice.invoice}`} className="comic-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-sm tracking-widest text-brand-red">{invoice.invoice}</p>
                  <h4 className="font-display text-2xl">{invoice.name}</h4>
                  <p className="font-comic text-sm">
                    {[invoice.email, invoice.phone].filter(Boolean).join(" · ") || "No contact on file"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl">{formatCurrency(invoice.total)}</p>
                  <p className="font-comic text-sm">{payLabel(mark, channels.get(invoice.invoice))}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-2 font-comic text-sm">
                {invoice.lots.map((lot) => {
                  const src = lot.image || images.get(lot.id);
                  return (
                    <li key={lot.id} className="flex items-center gap-3">
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          className="h-14 w-14 shrink-0 border-2 border-black object-cover"
                        />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center border-2 border-black bg-white text-[10px]">
                          No photo
                        </span>
                      )}
                      <span>
                        {lot.lotNumber ? `${lot.lotNumber} · ` : ""}
                        {lot.title} · {formatCurrency(lot.hammer)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {paidAlready ? null : (
                  <button
                    type="button"
                    className="comic-btn"
                    disabled={busy === invoice.invoice}
                    onClick={() => onCash(invoice)}
                  >
                    Mark paid in cash
                  </button>
                )}
                {needsPickup(invoice, mark) ? (
                  <button
                    type="button"
                    className="comic-btn-invert"
                    disabled={busy === invoice.invoice}
                    onClick={() => onPickup(invoice)}
                  >
                    Mark picked up
                  </button>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
