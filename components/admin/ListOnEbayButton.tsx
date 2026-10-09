"use client";

import { useState } from "react";
import type { AuctionLot } from "@/lib/utils";

export function ListOnEbayButton({
  lot,
  onDone,
}: {
  lot: AuctionLot;
  onDone?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optIn, setOptIn] = useState(Boolean(lot.ebayListingId));

  if (lot.paidAt) return null;

  async function list() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ebay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.id }),
      });
      const json = (await response.json()) as {
        error?: string;
        connectUrl?: string;
        message?: string;
        listingUrl?: string;
        mock?: boolean;
      };
      if (response.status === 409 && json.connectUrl) {
        window.location.href = json.connectUrl;
        return;
      }
      if (!response.ok) throw new Error(json.error || "Could not list on eBay.");
      setOptIn(true);
      onDone?.(json.message || (json.mock ? "Saved a local eBay ticket." : "Listed on eBay."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list on eBay.");
    } finally {
      setBusy(false);
    }
  }

  const listed = Boolean(lot.ebayListingId || lot.ebayListingUrl);

  return (
    <fieldset className="space-y-2 border-4 border-black bg-white p-3">
      <legend className="px-1 font-comic text-sm font-bold">eBay (optional)</legend>
      <label className="flex items-start gap-2 font-comic text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={optIn || listed}
          disabled={listed || busy}
          onChange={(e) => setOptIn(e.target.checked)}
        />
        <span>
          List this Buy Now item on eBay. Leave unchecked to keep it on DealFinder only.
        </span>
      </label>
      {listed ? (
        <p className="font-comic text-xs">
          Already listed{lot.ebayListedAt ? ` ${new Date(lot.ebayListedAt).toLocaleString()}` : ""}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {lot.ebayListingUrl ? (
          <a
            href={lot.ebayListingUrl}
            target="_blank"
            rel="noreferrer"
            className="comic-btn-invert inline-block !px-3 !py-2 !text-sm"
          >
            View on eBay
          </a>
        ) : null}
        <button
          type="button"
          className="comic-btn !px-3 !py-2 !text-sm"
          disabled={busy || (!optIn && !listed)}
          onClick={() => void list()}
        >
          {busy ? "Listing…" : listed ? "Update on eBay" : "List on eBay"}
        </button>
      </div>
      {error ? <p className="font-comic text-xs text-brand-red">{error}</p> : null}
    </fieldset>
  );
}
