"use client";

import { LotImage } from "@/components/LotImage";
import { sortLotsByNumber } from "@/lib/catalogNumbers";
import { lotIsUnsoldOrNoBid, lotWasSold } from "@/lib/settlements";
import { formatCurrency, type AuctionEvent, type AuctionLot } from "@/lib/utils";

export function AuctionInventories({
  events,
  lots,
  selectedIds,
  onToggle,
  onToggleGroup,
  onMoveToSale,
  onRemove,
  onDeleteLot,
}: {
  events: AuctionEvent[];
  lots: AuctionLot[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleGroup: (groupLots: AuctionLot[], checked: boolean) => void;
  onMoveToSale: (lot: AuctionLot) => void;
  onRemove: (lot: AuctionLot) => void;
  onDeleteLot: (lot: AuctionLot) => void;
}) {
  const orderedEvents = [...events]
    .filter((event) => !event.archivedAt)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const openIds = new Set(orderedEvents.map((event) => event.id));
  const unassigned = sortLotsByNumber(
    lots.filter((lot) => {
      if (lotWasSold(lot)) return false;
      return !lot.eventId || !openIds.has(lot.eventId);
    }),
  );

  return (
    <div className="space-y-8">
      {unassigned.length > 0 && (
        <AuctionLotGroup
          title="Unassigned warehouse"
          subtitle="Approved or generated lots waiting for an upcoming auction."
          lots={unassigned}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onToggleGroup={onToggleGroup}
          onMoveToSale={onMoveToSale}
          onRemove={onRemove}
          onDeleteLot={onDeleteLot}
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
            selectedIds={selectedIds}
            onToggle={onToggle}
            onToggleGroup={onToggleGroup}
            onMoveToSale={onMoveToSale}
            onRemove={onRemove}
            onDeleteLot={onDeleteLot}
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
  selectedIds,
  onToggle,
  onToggleGroup,
  onMoveToSale,
  onRemove,
  onDeleteLot,
}: {
  title: string;
  subtitle: string;
  lots: AuctionLot[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleGroup: (groupLots: AuctionLot[], checked: boolean) => void;
  onMoveToSale: (lot: AuctionLot) => void;
  onRemove: (lot: AuctionLot) => void;
  onDeleteLot: (lot: AuctionLot) => void;
}) {
  const allSelected = lots.length > 0 && lots.every((lot) => selectedIds.has(lot.id));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="break-words font-display text-2xl sm:text-3xl">{title}</h3>
          <p className="font-comic text-sm">{subtitle}</p>
        </div>
        {lots.length > 0 ? (
          <label className="font-comic text-sm font-bold">
            <input
              type="checkbox"
              className="mr-2"
              checked={allSelected}
              onChange={(e) => onToggleGroup(lots, e.target.checked)}
            />
            Select all
          </label>
        ) : null}
      </div>
      {lots.length === 0 ? (
        <p className="comic-panel-sm p-3 font-comic text-sm">No lots filed here yet.</p>
      ) : (
        <div className="comic-table-wrap">
          <table className="w-full min-w-[720px] border-collapse font-comic text-sm">
            <thead className="bg-black text-left text-white">
              <tr>
                <th className="border-b-4 border-black p-2 w-10" />
                <th className="border-b-4 border-black p-2">Lot</th>
                <th className="border-b-4 border-black p-2">Item</th>
                <th className="border-b-4 border-black p-2">Bid</th>
                <th className="border-b-4 border-black p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const sold = lotWasSold(lot);
                const unsold = lotIsUnsoldOrNoBid(lot);
                return (
                  <tr key={lot.id} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-2 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lot.id)}
                        onChange={(e) => onToggle(lot.id, e.target.checked)}
                        aria-label={`Select ${lot.lotNumber ?? lot.title}`}
                      />
                    </td>
                    <td className="border-b-2 border-black p-2 align-top">
                      <div className="relative mb-2 h-16 w-16 overflow-hidden border-2 border-black bg-white">
                        <LotImage src={lot.image} alt="" fill className="object-cover" sizes="64px" />
                      </div>
                      <p className="font-display text-sm text-brand-red">
                        {lot.lotNumber ?? "No lot #"}
                      </p>
                      <p className="text-xs">
                        {(lot.status ?? "paused").toUpperCase()}
                        {sold ? " · SOLD" : unsold ? " · DID NOT SELL" : ""}
                      </p>
                    </td>
                    <td className="border-b-2 border-black p-2 align-top">
                      <p className="font-display text-lg leading-tight">{lot.title}</p>
                      <p className="text-xs">{lot.consignor}</p>
                      <p className="mt-1 line-clamp-2">{lot.description}</p>
                    </td>
                    <td className="border-b-2 border-black p-2 align-top font-bold">
                      {formatCurrency(lot.currentBid)}
                    </td>
                    <td className="border-b-2 border-black p-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {sold ? null : (
                          <button
                            type="button"
                            className="comic-btn-invert !px-2 !py-1 !text-sm"
                            onClick={() => onMoveToSale(lot)}
                          >
                            Move to sale
                          </button>
                        )}
                        <button
                          type="button"
                          className="comic-btn-invert !px-2 !py-1 !text-sm"
                          onClick={() => onRemove(lot)}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="comic-btn !px-2 !py-1 !text-sm"
                          onClick={() => onDeleteLot(lot)}
                        >
                          Delete lot
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
