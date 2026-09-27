"use client";

import { useEffect, useMemo, useState } from "react";
import { saleKind } from "@/lib/liveSales";
import type { AuctionEvent } from "@/lib/utils";

function endsLabel(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  });
}

function weekOptions(events: AuctionEvent[], now = Date.now()) {
  return events
    .filter((event) => !event.archivedAt && saleKind(event, now) !== "past")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((event) => ({
      id: event.id,
      label: `${event.auctionNumber ? `${event.auctionNumber} · ` : ""}${event.name} · ends ${endsLabel(event.endsAt)}`,
    }));
}

export function SaleWeekPicker({
  open,
  lotLabel,
  events,
  onClose,
  onSelect,
}: {
  open: boolean;
  lotLabel: string;
  events: AuctionEvent[];
  onClose: () => void;
  onSelect: (eventId: string) => void;
}) {
  const options = useMemo(() => weekOptions(events), [events]);
  const defaultId =
    options.find((row) => events.some((event) => event.id === row.id && saleKind(event) === "live"))?.id ??
    options[0]?.id ??
    "";
  const [value, setValue] = useState(defaultId);

  useEffect(() => {
    if (open) setValue(defaultId);
  }, [open, defaultId]);

  const eventIds = new Set(events.filter((event) => !event.archivedAt).map((event) => event.id));
  const canFile = Boolean(value && eventIds.has(value));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-week-title"
    >
      <div className="w-full max-w-md comic-panel p-4">
        <h2 id="sale-week-title" className="font-display text-2xl">
          Pick the sale week
        </h2>
        <p className="mt-1 font-comic text-sm">
          File <strong>{lotLabel}</strong> into the current auction or an upcoming one. Ended sales are not listed.
        </p>
        <label className="mt-4 block font-comic text-sm font-bold">
          Auction week
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          >
            {options.length === 0 ? <option value="">No current or upcoming auctions</option> : null}
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" className="comic-btn" disabled={!canFile} onClick={() => onSelect(value)}>
            File into this week
          </button>
          <button type="button" className="comic-btn-invert" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export const AuctionCalendarModal = SaleWeekPicker;
