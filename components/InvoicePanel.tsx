"use client";

import Link from "next/link";
import { PICKUP_INSTRUCTIONS, fulfillmentInstructions, fulfillmentLabel } from "@/lib/payments";
import { formatCurrency } from "@/lib/utils";
import type { WinInvoice } from "@/lib/winTypes";
import type { FulfillmentChoice } from "@/lib/payments";

export function InvoicePanel({
  win,
  busy,
  onFulfillment,
  onPay,
}: {
  win: WinInvoice;
  busy?: boolean;
  onFulfillment?: (lotId: string, fulfillment: FulfillmentChoice) => void;
  onPay?: (lotId: string) => void;
}) {
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
          {formatCurrency(win.currentBid)}
        </p>
      </div>
      <p className="mt-2 font-comic text-sm">
        Invoice <strong>{win.invoice}</strong> · Helcim card
        {win.paid ? " · PAID" : ""}
      </p>

      <p className="mt-4 font-display text-xl">How should we send it?</p>
      <p className="font-comic text-sm">
        {win.winning
          ? "Choose after you win. The house packs from this choice."
          : "Shipping opens after the hammer. You are the high paddle until then."}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy || !win.winning}
          className={win.fulfillment === "ship" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => onFulfillment?.(win.lotId, "ship")}
        >
          Ship it
        </button>
        <button
          type="button"
          disabled={busy || !win.winning}
          className={win.fulfillment === "pickup" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => onFulfillment?.(win.lotId, "pickup")}
        >
          Pick up
        </button>
      </div>
      <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
        {fulfillmentLabel(win.fulfillment)}. {fulfillmentInstructions(win.fulfillment, win.address)}
      </p>

      <p className="mt-3 font-comic text-sm">{win.instructions}</p>
      {win.fulfillment === "pickup" ? (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          {PICKUP_INSTRUCTIONS}
        </p>
      ) : null}
      {win.winning && !win.paid && onPay ? (
        <button
          type="button"
          className="comic-btn mt-3 w-full"
          disabled={busy}
          onClick={() => onPay(win.lotId)}
        >
          Pay {formatCurrency(win.currentBid)} with Helcim
        </button>
      ) : null}
      {win.paid ? (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          Paid with Helcim{win.paidAt ? ` · ${new Date(win.paidAt).toLocaleString()}` : ""}. The $50
          bidding hold is released back to the card once this sale goes through.
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
