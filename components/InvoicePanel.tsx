"use client";

import Link from "next/link";
import { INTERAC_EMAIL, PICKUP_INSTRUCTIONS } from "@/lib/payments";
import { formatCurrency } from "@/lib/utils";
import type { WinInvoice } from "@/lib/winTypes";

export function InvoicePanel({ win }: { win: WinInvoice }) {
  return (
    <article className="comic-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm tracking-[0.2em] text-[#FF0000]">
            {win.winning ? "YOU ARE HIGH PADDLE" : "HAMMERED — INVOICE"}
          </p>
          <h2 className="font-display text-3xl leading-none">{win.title}</h2>
        </div>
        <p className="font-display text-3xl text-[#FF0000]">
          {formatCurrency(win.currentBid)}
        </p>
      </div>
      <p className="mt-2 font-comic text-sm">
        Invoice <strong>{win.invoice}</strong> · {win.paymentMethod}
      </p>
      <p className="mt-2 font-comic text-sm">{win.instructions}</p>
      {win.paymentMethodKey === "interac_etransfer" && (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          Interac recipient: <strong>{INTERAC_EMAIL}</strong>
        </p>
      )}
      {win.paymentMethodKey === "pay_on_arrival" && (
        <p className="mt-3 border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          {PICKUP_INSTRUCTIONS}
        </p>
      )}
      <Link
        href={`/auctions/${win.slug || win.lotId}`}
        className="mt-3 inline-block font-display text-lg underline"
      >
        View lot →
      </Link>
    </article>
  );
}
