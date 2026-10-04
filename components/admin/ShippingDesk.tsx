"use client";

import { useEffect, useMemo, useState } from "react";
import { canadaPostPostage } from "@/lib/canadaPost";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { SITE } from "@/lib/site";
import { formatCurrency } from "@/lib/utils";

type DeskView = "ship" | "pickup" | "all";

function escapePrint(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function channelLabel(row: SettlementInvoiceRecord) {
  return row.eventId ? "Auction" : "Buy Now";
}

function deliveryLabel(row: SettlementInvoiceRecord) {
  if (row.fulfillment === "ship") return "Ship";
  if (row.fulfillment === "pickup") return "Pickup";
  return "Not chosen";
}

export function ShippingDesk() {
  const [rows, setRows] = useState<SettlementInvoiceRecord[]>([]);
  const [view, setView] = useState<DeskView>("ship");
  const [selectedId, setSelectedId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [postageOverride, setPostageOverride] = useState("");
  const [tracking, setTracking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/settlements", { cache: "no-store" });
    const body = (await response.json()) as { invoices?: SettlementInvoiceRecord[]; error?: string };
    if (!response.ok) {
      setError(body.error || "Could not load settlements.");
      return;
    }
    setRows(body.invoices ?? []);
  }

  useEffect(() => {
    void load().catch(() => setError("Could not load settlements."));
  }, []);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (view === "ship") {
        return row.fulfillment === "ship" && row.payment === "paid" && row.shipping !== "shipped";
      }
      if (view === "pickup") {
        return row.fulfillment === "pickup" && row.shipping !== "picked_up";
      }
      return true;
    });
  }, [rows, view]);

  const selected = rows.find((row) => row.invoice === selectedId) ?? null;

  function pick(row: SettlementInvoiceRecord) {
    setSelectedId(row.invoice);
    setWeightKg(row.weightKg ? String(row.weightKg) : "");
    setLengthCm(row.lengthCm ? String(row.lengthCm) : "");
    setWidthCm(row.widthCm ? String(row.widthCm) : "");
    setHeightCm(row.heightCm ? String(row.heightCm) : "");
    setPostageOverride(row.shippingCost ? String(row.shippingCost) : "");
    setTracking(row.trackingNumber ?? "");
    setNotice("");
    setError("");
  }

  const parcel = {
    weightKg: Number(weightKg) || 0,
    lengthCm: Number(lengthCm) || 0,
    widthCm: Number(widthCm) || 0,
    heightCm: Number(heightCm) || 0,
  };
  const quote = selected
    ? canadaPostPostage({ address: selected.address, ...parcel })
    : null;
  const postage = postageOverride.trim() ? Number(postageOverride) || 0 : 0;

  async function save(next: Partial<SettlementInvoiceRecord>) {
    if (!selected) return null;
    setBusy(true);
    setError("");
    setNotice("");
    const payload: SettlementInvoiceRecord = {
      ...selected,
      ...parcel,
      trackingNumber: tracking.trim(),
      shippingCost: postage,
      ...next,
    };
    const response = await fetch("/api/admin/settlements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { error?: string; invoice?: SettlementInvoiceRecord };
    setBusy(false);
    if (!response.ok || !body.invoice) {
      setError(body.error || "Could not save this settlement.");
      return null;
    }
    setRows((current) => current.map((row) => (row.invoice === body.invoice!.invoice ? body.invoice! : row)));
    return body.invoice;
  }

  function printLabel() {
    if (!selected || !quote) return;
    const lots = escapePrint(selected.lots.map((lot) => lot.title).join(", ") || "Lots");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label ${selected.invoice}</title>
<style>
  @page { size: 4in 6in; margin: 0.2in; }
  body { margin: 0; font-family: Arial, sans-serif; color: #000; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 26px; margin: 0 0 4px; }
  p { margin: 0 0 4px; font-size: 14px; }
  .tag { font-size: 11px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 14px; }
  .rule { border-top: 3px solid #000; margin-top: 12px; padding-top: 8px; }
</style></head><body>
<p class="tag">From</p>
<h1>${escapePrint(SITE.name)}</h1>
<p>${escapePrint(SITE.addressLine)}</p>
<p>${escapePrint(SITE.cityLine)}</p>
<p class="tag">To</p>
<h2>${escapePrint(selected.name || "Customer")}</h2>
<p>${escapePrint(selected.address || "Address missing")}</p>
<p>${escapePrint(selected.phone || "")}</p>
<div class="rule">
<p>Invoice ${escapePrint(selected.invoice)}</p>
<p>${lots}</p>
<p>${parcel.weightKg || "—"} kg · ${parcel.lengthCm || "—"} × ${parcel.widthCm || "—"} × ${parcel.heightCm || "—"} cm</p>
<p>Canada Post postage $${postage.toFixed(2)} · billable ${quote.billableKg} kg</p>
${tracking.trim() ? `<p>Tracking ${escapePrint(tracking.trim())}</p>` : ""}
</div>
</body></html>`;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
    if (!popup) {
      window.print();
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function emailQuote() {
    if (!selected || !quote) return;
    const saved = await save({ shipping: selected.shipping === "pending" ? "ready" : selected.shipping });
    if (!saved) return;
    setBusy(true);
    const response = await fetch("/api/admin/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: selected.email,
        name: selected.name,
        invoice: selected.invoice,
        postage,
        ...parcel,
        lots: selected.lots.map((lot) => lot.title),
      }),
    });
    const body = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.error || "The quote was saved, but the email did not send.");
      return;
    }
    setNotice(`Quote emailed to ${selected.email}.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 print:hidden">
        {(
          [
            ["ship", "Paid shipments"],
            ["pickup", "Pickups"],
            ["all", "All settlements"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "comic-btn" : "comic-btn-invert"}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="comic-panel bg-brand-red p-3 font-comic text-white print:hidden">{error}</p> : null}
      {notice ? <p className="comic-panel p-3 font-comic print:hidden">{notice}</p> : null}

      <div className="comic-table-wrap print:hidden">
        <table className="w-full min-w-[720px] border-collapse font-comic text-sm">
          <thead>
            <tr className="border-b-4 border-black text-left font-display text-lg">
              <th className="p-2">Customer</th>
              <th className="p-2">Sale</th>
              <th className="p-2">Delivery</th>
              <th className="p-2">Payment</th>
              <th className="p-2">Status</th>
              <th className="p-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="p-3" colSpan={6}>
                  {view === "ship"
                    ? "No paid shipments are waiting. They show up here after a customer pays and chooses shipping."
                    : "Nothing in this list."}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={row.invoice}
                  className={`cursor-pointer border-b border-black/20 ${selectedId === row.invoice ? "bg-brand-cream" : ""}`}
                  onClick={() => pick(row)}
                >
                  <td className="p-2">
                    <span className="font-bold">{row.name || "Customer"}</span>
                    <span className="block text-xs">{row.invoice}</span>
                  </td>
                  <td className="p-2">{channelLabel(row)}</td>
                  <td className="p-2">{deliveryLabel(row)}</td>
                  <td className="p-2">{row.payment.replace("_", " ")}</td>
                  <td className="p-2">{row.shipping.replace("_", " ")}</td>
                  <td className="p-2">{formatCurrency(row.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_4in]">
          <div className="space-y-4 print:hidden">
            <div className="comic-panel p-4">
              <p className="font-display text-2xl text-brand-red">{selected.name || "Customer"}</p>
              <p className="font-comic text-sm">{selected.email}</p>
              <p className="font-comic text-sm">{selected.phone}</p>
              <p className="font-comic text-sm">{selected.address || "No shipping address on the settlement."}</p>
              <p className="mt-2 font-comic text-sm">
                {channelLabel(selected)} · {deliveryLabel(selected)} · {selected.lots.map((lot) => lot.title).join(", ") || "No lots"}
              </p>
            </div>

            {selected.fulfillment === "ship" ? (
              <div className="comic-panel space-y-3 p-4">
                <p className="font-display text-2xl">Parcel</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="font-comic text-sm">
                    Weight kg
                    <input className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} inputMode="decimal" />
                  </label>
                  <label className="font-comic text-sm">
                    Length cm
                    <input className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal" value={lengthCm} onChange={(event) => setLengthCm(event.target.value)} inputMode="decimal" />
                  </label>
                  <label className="font-comic text-sm">
                    Width cm
                    <input className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal" value={widthCm} onChange={(event) => setWidthCm(event.target.value)} inputMode="decimal" />
                  </label>
                  <label className="font-comic text-sm">
                    Height cm
                    <input className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="decimal" />
                  </label>
                </div>
                {quote ? (
                  <p className="font-comic text-sm">
                    Billable {quote.billableKg} kg to {quote.zoneLabel}. Regular Parcel uses the greater of the scale weight and length × width × height ÷ 6,000.
                    Published counter base prices for this weight run {formatCurrency(quote.low)} to {formatCurrency(quote.high)}. Fuel surcharge is extra. A small-business Expedited parcel cubes at ÷ 5,000
                    {quote.expeditedVolumetricKg ? ` (about ${quote.expeditedVolumetricKg} kg volumetric)` : ""}.
                  </p>
                ) : null}
                {quote?.problems.map((problem) => (
                  <p key={problem} className="font-comic text-sm text-brand-red">
                    {problem}
                  </p>
                ))}
                <label className="block font-comic text-sm">
                  Postage to email the customer
                  <input
                    className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
                    value={postageOverride}
                    onChange={(event) => setPostageOverride(event.target.value)}
                    inputMode="decimal"
                    placeholder="Counter price"
                  />
                </label>
                <label className="block font-comic text-sm">
                  Tracking number
                  <input className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal" value={tracking} onChange={(event) => setTracking(event.target.value)} />
                </label>
                <p className="font-comic text-xs">
                  Type the Canada Post counter price, or the price on your small-business account. The printed sheet is an address label from the Airdrie desk, not a prepaid barcode.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="comic-btn-invert"
                    onClick={() => quote && setPostageOverride(String(quote.high))}
                  >
                    Use highest published rate {quote ? formatCurrency(quote.high) : ""}
                  </button>
                  <button type="button" className="comic-btn" disabled={busy || postage <= 0} onClick={() => void emailQuote()}>
                    Email quote {postage > 0 ? formatCurrency(postage) : ""}
                  </button>
                  <button
                    type="button"
                    className="comic-btn-invert"
                    disabled={busy || postage <= 0}
                    onClick={() =>
                      void save({ shipping: "ready" }).then((saved) => {
                        if (saved) setNotice("Quote saved on the settlement.");
                      })
                    }
                  >
                    Save quote
                  </button>
                  <button type="button" className="comic-btn-invert" onClick={printLabel}>
                    Print label
                  </button>
                  <button
                    type="button"
                    className="comic-btn"
                    disabled={busy || !tracking.trim()}
                    onClick={() =>
                      void save({ shipping: "shipped" }).then((saved) => {
                        if (saved) setNotice(`Marked shipped. Tracking ${tracking.trim()}.`);
                      })
                    }
                  >
                    Mark shipped
                  </button>
                </div>
              </div>
            ) : (
              <div className="comic-panel space-y-3 p-4">
                <p className="font-comic text-sm">
                  This settlement is {deliveryLabel(selected).toLowerCase()}. Shipping quotes are for paid customers who chose shipment.
                </p>
                {selected.fulfillment === "pickup" ? (
                  <button
                    type="button"
                    className="comic-btn"
                    disabled={busy}
                    onClick={() =>
                      void save({ shipping: "picked_up" }).then((saved) => {
                        if (saved) setNotice("Marked picked up.");
                      })
                    }
                  >
                    Mark picked up
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {selected.fulfillment === "ship" ? (
            <article className="shipping-label border-4 border-black bg-white p-4 text-black shadow-comic print:border-black print:shadow-none">
              <p className="font-comic text-xs font-bold uppercase tracking-wide">From</p>
              <p className="font-display text-2xl leading-none">{SITE.name}</p>
              <p className="font-comic text-sm">{SITE.addressLine}</p>
              <p className="font-comic text-sm">{SITE.cityLine}</p>
              <p className="mt-4 font-comic text-xs font-bold uppercase tracking-wide">To</p>
              <p className="font-display text-3xl leading-none">{selected.name || "Customer"}</p>
              <p className="font-comic text-base">{selected.address || "Address missing"}</p>
              <p className="font-comic text-sm">{selected.phone}</p>
              <div className="mt-4 border-t-4 border-black pt-3 font-comic text-sm">
                <p>Invoice {selected.invoice}</p>
                <p>{selected.lots.map((lot) => lot.title).join(", ") || "Lots"}</p>
                <p>
                  {parcel.weightKg || "—"} kg · {parcel.lengthCm || "—"} × {parcel.widthCm || "—"} × {parcel.heightCm || "—"} cm
                </p>
                <p>
                  Canada Post postage {formatCurrency(postage)}
                  {quote ? ` · billable ${quote.billableKg} kg` : ""}
                </p>
                {tracking.trim() ? <p>Tracking {tracking.trim()}</p> : null}
              </div>
            </article>
          ) : null}
        </div>
      ) : (
        <p className="font-comic text-sm print:hidden">Pick a settlement to fill the label.</p>
      )}
    </div>
  );
}
