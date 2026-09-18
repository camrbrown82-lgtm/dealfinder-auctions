"use client";

import { useEffect, useState } from "react";
import type { AuctionEvent } from "@/lib/utils";

export function RelistLotsModal({
  open,
  count,
  events,
  busy,
  error,
  defaultStart = "9000",
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  events: AuctionEvent[];
  busy?: boolean;
  error?: string | null;
  defaultStart?: string;
  onClose: () => void;
  onConfirm: (eventId: string, lotStart: string) => void;
}) {
  const openEvents = events.filter((event) => !event.archivedAt);
  const [eventId, setEventId] = useState(openEvents[0]?.id ?? "");
  const [lotStart, setLotStart] = useState(defaultStart);

  useEffect(() => {
    if (!open) return;
    setEventId(openEvents[0]?.id ?? "");
    setLotStart(defaultStart);
  }, [open, defaultStart, events]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="relist-title" className="w-full max-w-lg comic-panel p-4">
        <h2 id="relist-title" className="font-display text-3xl text-brand-red">
          Relist {count} {count === 1 ? "lot" : "lots"}
        </h2>
        <p className="mt-2 font-comic text-sm">
          Move selected unsold items into an upcoming auction and assign sequential lot numbers from
          the start you enter (example: 9000 or LOT-10000).
        </p>
        {error ? (
          <p className="mt-3 border-4 border-black bg-brand-red p-2 font-comic text-sm text-white">{error}</p>
        ) : null}
        <label className="mt-4 block font-comic text-sm font-bold">
          Target auction
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
            disabled={busy}
          >
            {openEvents.length === 0 ? <option value="">No upcoming auctions</option> : null}
            {openEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.auctionNumber ?? event.id} · {event.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block font-comic text-sm font-bold">
          Starting lot number / range prefix
          <input
            value={lotStart}
            onChange={(e) => setLotStart(e.target.value)}
            placeholder="9000"
            className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
            disabled={busy}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="comic-btn"
            disabled={!eventId || busy}
            onClick={() => onConfirm(eventId, lotStart)}
          >
            {busy ? "Relisting…" : "Relist selected"}
          </button>
          <button type="button" className="comic-btn-invert" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
