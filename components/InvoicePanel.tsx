"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CANADIAN_PROVINCES,
  PICKUP_INSTRUCTIONS,
  fulfillmentInstructions,
  fulfillmentLabel,
} from "@/lib/payments";
import { formatCurrency } from "@/lib/utils";
import type { WinInvoice } from "@/lib/winTypes";
import type { FulfillmentChoice } from "@/lib/payments";

export function InvoicePanel({
  win,
  busy,
  onFulfillment,
  onPay,
  onCash,
  onAddress,
}: {
  win: WinInvoice;
  busy?: boolean;
  onFulfillment?: (lotId: string, fulfillment: FulfillmentChoice) => void;
  onPay?: (lotId: string) => void;
  onCash?: (lotId: string) => void;
  onAddress?: (
    lotId: string,
    address: {
      fullName: string;
      street: string;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
    },
  ) => void;
}) {
  const [form, setForm] = useState({
    fullName: win.buyerName ?? "",
    phone: win.phone ?? "",
    street: "",
    city: "",
    province: "AB",
    postalCode: "",
  });
  const method =
    win.fulfillment === "ship" ? "Shipping" : win.fulfillment === "pickup" ? "Local Pickup" : "Choose fulfillment";
  const cashPending = win.payment === "cash_pending";
  const paidCash = win.paid && win.paymentChannel === "cash";

  return (
    <article className="comic-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm tracking-[0.2em] text-[#FF0000]">
            {win.winning ? "YOU WON THIS LOT" : "INVOICE"}
          </p>
          <h2 className="font-display text-3xl leading-none">{win.title}</h2>
        </div>
        <p className="font-display text-3xl text-[#FF0000]">
          {formatCurrency(win.total)}
        </p>
      </div>
      <p className="mt-2 font-comic text-sm">
        Invoice <strong>{win.invoice}</strong> · {method}
        {win.paid ? (paidCash ? " · PAID IN CASH" : " · PAID") : cashPending ? " · CASH PENDING APPROVAL" : ""}
      </p>
      <p className="mt-1 font-comic text-sm">
        {win.buyerName}
        {win.phone ? ` · ${win.phone}` : ""}
      </p>

      <p className="mt-4 font-display text-xl">How should we send it?</p>
      <p className="font-comic text-sm">
        Choose local pickup or shipping. Totals update before Helcim checkout.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy || !win.winning || win.paid}
          className={win.fulfillment === "pickup" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => onFulfillment?.(win.lotId, "pickup")}
        >
          Local Pickup
        </button>
        <button
          type="button"
          disabled={busy || !win.winning || win.paid}
          className={win.fulfillment === "ship" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => onFulfillment?.(win.lotId, "ship")}
        >
          Shipping Required
        </button>
      </div>
      <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
        {fulfillmentLabel(win.fulfillment)}. {fulfillmentInstructions(win.fulfillment, win.address)}
      </p>

      {win.fulfillment === "ship" && !win.paid ? (
        <form
          className="mt-3 grid gap-2 border-4 border-black bg-white p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onAddress?.(win.lotId, form);
          }}
        >
          <p className="font-display text-lg sm:col-span-2">Confirm shipping address</p>
          <label className="font-comic text-sm">
            Full name
            <input
              className="mt-1 w-full border-4 border-black px-2 py-1"
              value={form.fullName}
              onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
              required
            />
          </label>
          <label className="font-comic text-sm">
            Phone
            <input
              className="mt-1 w-full border-4 border-black px-2 py-1"
              value={form.phone}
              onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
              required
            />
          </label>
          <label className="font-comic text-sm sm:col-span-2">
            Street address
            <input
              className="mt-1 w-full border-4 border-black px-2 py-1"
              value={form.street}
              onChange={(e) => setForm((current) => ({ ...current, street: e.target.value }))}
              required
            />
          </label>
          <label className="font-comic text-sm">
            City
            <input
              className="mt-1 w-full border-4 border-black px-2 py-1"
              value={form.city}
              onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))}
              required
            />
          </label>
          <label className="font-comic text-sm">
            Province
            <select
              className="mt-1 w-full border-4 border-black px-2 py-1"
              value={form.province}
              onChange={(e) => setForm((current) => ({ ...current, province: e.target.value }))}
            >
              {CANADIAN_PROVINCES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="font-comic text-sm">
            Postal code
            <input
              className="mt-1 w-full border-4 border-black px-2 py-1"
              value={form.postalCode}
              onChange={(e) => setForm((current) => ({ ...current, postalCode: e.target.value }))}
              required
            />
          </label>
          <button type="submit" className="comic-btn sm:col-span-2" disabled={busy}>
            Save address &amp; refresh shipping estimate
          </button>
        </form>
      ) : null}

      <table className="mt-3 w-full border-collapse border-4 border-black bg-white font-comic text-sm">
        <tbody>
          <tr className="border-t-2 border-black">
            <td className="p-2">Hammer</td>
            <td className="p-2 text-right">{formatCurrency(win.currentBid)}</td>
          </tr>
          <tr className="border-t-2 border-black">
            <td className="p-2">15% buyer&apos;s premium</td>
            <td className="p-2 text-right">{formatCurrency(win.premium)}</td>
          </tr>
          {win.handling > 0 ? (
            <tr className="border-t-2 border-black">
              <td className="p-2">$10 shipping handling fee</td>
              <td className="p-2 text-right">{formatCurrency(win.handling)}</td>
            </tr>
          ) : null}
          {win.fulfillment === "ship" ? (
            <tr className="border-t-2 border-black">
              <td className="p-2">Estimated shipping</td>
              <td className="p-2 text-right">{formatCurrency(win.shippingCost)}</td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-black">
            <td className="p-2">5% GST</td>
            <td className="p-2 text-right">{formatCurrency(win.gst)}</td>
          </tr>
          <tr className="border-t-2 border-black font-bold">
            <td className="p-2">Amount due</td>
            <td className="p-2 text-right">{formatCurrency(win.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 font-comic text-sm">{win.instructions}</p>
      {win.fulfillment === "pickup" ? (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          {PICKUP_INSTRUCTIONS}
        </p>
      ) : null}
      {win.winning && !win.paid && !cashPending && onPay ? (
        <button
          type="button"
          className="comic-btn mt-3 w-full"
          disabled={busy || win.fulfillment === "unset" || !win.invoiceReady}
          onClick={() => onPay(win.lotId)}
        >
          {win.invoiceReady
            ? `Pay ${formatCurrency(win.total)} with Helcim`
            : "Pay opens after Sunday invoice"}
        </button>
      ) : null}
      {win.winning && !win.paid && !cashPending && onCash ? (
        <button
          type="button"
          className="comic-btn-invert mt-2 w-full"
          disabled={busy || !win.invoiceReady}
          onClick={() => onCash(win.lotId)}
        >
          Request Cash Payment on Pickup
        </button>
      ) : null}
      {!win.invoiceReady && win.winning && !win.paid ? (
        <p className="mt-3 border-4 border-black bg-[#FFF7D1] px-3 py-2 font-comic text-sm">
          Reserved. No payment is due until this auction closes on Sunday and your consolidated
          invoice is emailed.
        </p>
      ) : null}
      {cashPending ? (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          Cash payment is pending desk approval. You will get a receipt email once it is marked paid
          in cash.
        </p>
      ) : null}
      {win.paid ? (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          {paidCash
            ? `Paid in cash${win.paidAt ? ` · ${new Date(win.paidAt).toLocaleString()}` : ""}.`
            : `Paid with Helcim${win.paidAt ? ` · ${new Date(win.paidAt).toLocaleString()}` : ""}. The $50 Sunday hold is released back to the card once this sale goes through.`}
        </p>
      ) : null}
      <Link
        href={`/auctions/${win.slug || win.lotId}`}
        className="mt-3 inline-block font-display text-lg underline"
      >
        View lot →
      </Link>
    </article>
  );
}
