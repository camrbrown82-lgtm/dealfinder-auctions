"use client";

import { LotImage } from "@/components/LotImage";
import { sortLotsByNumber } from "@/lib/catalogNumbers";
import { lotWasSold } from "@/lib/settlements";
import { formatCurrency, type AuctionEvent, type AuctionLot } from "@/lib/utils";

export function AuctionInventories({
  events,
  lots,
  onMoveToSale,
  onRemove,
}: {
  events: AuctionEvent[];
  lots: AuctionLot[];
  onMoveToSale: (lot: AuctionLot) => void;
  onRemove: (lot: AuctionLot) => void;
}) {
  const orderedEvents = [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const unassigned = sortLotsByNumber(lots.filter((lot) => !lot.eventId));

  return (
    <div className="space-y-8">
      {unassigned.length > 0 && (
        <AuctionLotGroup
          title="Unassigned warehouse"
          subtitle="Approved or generated lots waiting for an upcoming auction."
          lots={unassigned}
          onMoveToSale={onMoveToSale}
          onRemove={onRemove}
        />
      )}
      {orderedEvents.map((event) => {
        const grouped = sortLotsByNumber(lots.filter((lot) => lot.eventId === event.id));
        return (
          <AuctionLotGroup
            key={event.id}
            title={`${event.auctionNumber ? `${event.auctionNumber} · ` : ""}${event.name}`}
            subtitle={`${new Date(event.startsAt).toLocaleString()} → ${new Date(event.endsAt).toLocaleString()} · ${grouped.length} lots`}
            lots={grouped}
            onMoveToSale={onMoveToSale}
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
  onMoveToSale,
  onRemove,
}: {
  title: string;
  subtitle: string;
  lots: AuctionLot[];
  onMoveToSale: (lot: AuctionLot) => void;
  onRemove: (lot: AuctionLot) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="break-words font-display text-2xl sm:text-3xl">{title}</h3>
        <p className="font-comic text-sm">{subtitle}</p>
      </div>
      {lots.length === 0 ? (
        <p className="comic-panel-sm p-3 font-comic text-sm">No lots filed here yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lots.map((lot) => {
            const sold = lotWasSold(lot);
            return (
              <li
                key={lot.id}
                className="comic-panel-sm flex flex-col gap-3 p-3 sm:flex-row"
              >
                <div className="relative h-40 w-full shrink-0 overflow-hidden border-4 border-black bg-white sm:h-28 sm:w-28">
                  <LotImage src={lot.image} alt={lot.title} fill className="object-cover" sizes="112px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm text-brand-red">
                    {lot.lotNumber ?? "No lot #"} · {(lot.status ?? "paused").toUpperCase()}
                    {sold ? " · SOLD" : lot.status === "ended" || lot.status === "removed" ? " · DID NOT SELL" : ""}
                  </p>
                  <h4 className="truncate font-display text-xl leading-tight">{lot.title}</h4>
                  <p className="font-comic text-xs">{lot.consignor}</p>
                  <p className="mt-1 line-clamp-2 font-comic text-sm">{lot.description}</p>
                  <p className="mt-1 font-comic text-sm font-bold">{formatCurrency(lot.currentBid)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sold ? null : (
                      <button
                        type="button"
                        className="comic-btn-invert !px-2 !py-1 !text-sm"
                        onClick={() => onMoveToSale(lot)}
                      >
                        Move to sale
                      </button>
                    )}
                    <button type="button" className="comic-btn !px-2 !py-1 !text-sm" onClick={() => onRemove(lot)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
