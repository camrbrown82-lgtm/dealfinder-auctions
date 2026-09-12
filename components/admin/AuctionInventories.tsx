"use client";

import { LotImage } from "@/components/LotImage";
import { formatCurrency, type AuctionEvent, type AuctionLot } from "@/lib/utils";

export function AuctionInventories({
  events,
  lots,
  onChooseWeek,
  onToggleLive,
  onRemove,
}: {
  events: AuctionEvent[];
  lots: AuctionLot[];
  onChooseWeek: (lot: AuctionLot) => void;
  onToggleLive: (lot: AuctionLot) => void;
  onRemove: (lot: AuctionLot) => void;
}) {
  const orderedEvents = [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const unassigned = lots.filter((lot) => !lot.eventId);

  return (
    <div className="space-y-8">
      {unassigned.length > 0 && (
        <AuctionLotGroup
          title="Unassigned warehouse"
          subtitle="Approved or generated lots waiting for a sale week."
          lots={unassigned}
          onChooseWeek={onChooseWeek}
          onToggleLive={onToggleLive}
          onRemove={onRemove}
        />
      )}
      {orderedEvents.map((event) => {
        const grouped = lots.filter((lot) => lot.eventId === event.id);
        return (
          <AuctionLotGroup
            key={event.id}
            title={`${event.auctionNumber ? `${event.auctionNumber} · ` : ""}${event.name}`}
            subtitle={`${new Date(event.startsAt).toLocaleString()} → ${new Date(event.endsAt).toLocaleString()} · ${grouped.length} lots`}
            lots={grouped}
            onChooseWeek={onChooseWeek}
            onToggleLive={onToggleLive}
            onRemove={onRemove}
          />
        );
      })}
    </div>
  );
}

function AuctionLotGroup({
  title,
  subtitle,
  lots,
  onChooseWeek,
  onToggleLive,
  onRemove,
}: {
  title: string;
  subtitle: string;
  lots: AuctionLot[];
  onChooseWeek: (lot: AuctionLot) => void;
  onToggleLive: (lot: AuctionLot) => void;
  onRemove: (lot: AuctionLot) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-3xl">{title}</h3>
        <p className="font-comic text-sm">{subtitle}</p>
      </div>
      {lots.length === 0 ? (
        <p className="border-4 border-black bg-white p-3 font-comic text-sm">No lots filed here yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lots.map((lot) => (
            <li
              key={lot.id}
              className="flex gap-3 border-4 border-black bg-[#FFF7D1] p-3 shadow-[4px_4px_0_0_#000]"
            >
              <div className="relative h-28 w-28 shrink-0 overflow-hidden border-4 border-black bg-white">
                <LotImage src={lot.image} alt={lot.title} fill className="object-cover" sizes="112px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm text-brand-red">
                  {lot.lotNumber ?? "No lot #"} · {(lot.status ?? "paused").toUpperCase()}
                </p>
                <h4 className="truncate font-display text-xl leading-tight">{lot.title}</h4>
                <p className="font-comic text-xs">{lot.consignor}</p>
                <p className="mt-1 line-clamp-2 font-comic text-sm">{lot.description}</p>
                <p className="mt-1 font-comic text-sm font-bold">{formatCurrency(lot.currentBid)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="comic-btn-invert !px-2 !py-1 !text-sm"
                    onClick={() => onChooseWeek(lot)}
                  >
                    Sale week
                  </button>
                  <button
                    type="button"
                    className="comic-btn-invert !px-2 !py-1 !text-sm"
                    onClick={() => onToggleLive(lot)}
                  >
                    {lot.status === "live" ? "Pause" : "Go live"}
                  </button>
                  <button type="button" className="comic-btn !px-2 !py-1 !text-sm" onClick={() => onRemove(lot)}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
