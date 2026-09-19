"use client";

import { useMemo, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { AuctionInventories } from "@/components/admin/AuctionInventories";
import { HouseCatalogSettings } from "@/components/admin/HouseCatalogSettings";
import { RelistLotsModal } from "@/components/admin/RelistLotsModal";
import { DEFAULT_HOUSE_STARTING_BID } from "@/lib/houseDesk";
import { listingGradeOf } from "@/lib/listingGrade";
import { lotIsUnsoldOrNoBid, lotNeedsRelist } from "@/lib/settlements";
import type { AuctionLot } from "@/lib/utils";

export default function AdminInventoriesPage() {
  const { data, setNotice, setError, mutate } = useAdminDesk();
  const [search, setSearch] = useState("");
  const [filingLot, setFilingLot] = useState<AuctionLot | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<"all" | "unsold">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [relistOpen, setRelistOpen] = useState(false);
  const [relistBusy, setRelistBusy] = useState(false);
  const [relistError, setRelistError] = useState<string | null>(null);

  async function fileLotIntoSale(eventId: string) {
    if (!filingLot) return;
    const lot = filingLot;
    const relist = lotNeedsRelist(lot) && Boolean(lot.eventId || lot.status === "ended");
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "lot",
        id: lot.id,
        eventId,
        status: "live",
        relist,
        startingBid: lot.startingBid,
      }),
    });
    if (!json) return;
    setFilingLot(null);
    setNotice(`Moved ${lot.title} into the selected auction.`);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleGroup(groupLots: AuctionLot[], checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const lot of groupLots) {
        if (checked) next.add(lot.id);
        else next.delete(lot.id);
      }
      return next;
    });
  }

  async function deleteLots(ids: string[]) {
    if (!ids.length) return;
    const label = ids.length === 1 ? "this lot" : `${ids.length} lots`;
    if (!window.confirm(`Delete ${label} from inventory? Bids and absentee maxes on these lots are removed.`)) {
      return;
    }
    const json = await mutate("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteLots", lotIds: ids }),
    });
    if (!json) return;
    setSelectedIds(new Set());
    setNotice(`Deleted ${json.deleted ?? ids.length} lot${ids.length === 1 ? "" : "s"}.`);
  }

  async function relistSelected(eventId: string, lotStart: string) {
    const ids = selectedUnsold.map((lot) => lot.id);
    setRelistBusy(true);
    setRelistError(null);
    const json = await mutate("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "relistLots", lotIds: ids, eventId, lotStart }),
    });
    setRelistBusy(false);
    if (!json) {
      setRelistError("Could not relist those lots.");
      return;
    }
    setRelistOpen(false);
    setSelectedIds(new Set());
    const count = Array.isArray(json.lots) ? json.lots.length : ids.length;
    setNotice(`Relisted ${count} lots into ${json.auctionNumber ?? "the selected auction"} from ${json.start ?? lotStart}.`);
  }

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = data.inventory.filter((lot) => lot.saleChannel !== "buy_now");
    if (filter === "unsold") list = list.filter(lotIsUnsoldOrNoBid);
    if (!q) return list;
    return list.filter(
      (lot) =>
        lot.title.toLowerCase().includes(q) ||
        lot.consignor.toLowerCase().includes(q) ||
        listingGradeOf(lot).toLowerCase().includes(q) ||
        (lot.lotNumber ?? "").toLowerCase().includes(q) ||
        (lot.auctionNumber ?? "").toLowerCase().includes(q) ||
        lot.description.toLowerCase().includes(q),
    );
  }, [data, search, filter]);

  const upcomingEvents = data.events.filter((event) => !event.archivedAt);
  const visibleEvents = showArchived
    ? data.events
    : data.events.filter(
        (event) => !event.archivedAt || filteredInventory.some((lot) => lot.eventId === event.id),
      );
  const selectedCount = selectedIds.size;
  const selectedUnsold = data.inventory.filter(
    (lot) => selectedIds.has(lot.id) && lot.saleChannel !== "buy_now" && lotIsUnsoldOrNoBid(lot),
  );

  return (
    <AdminShell
      title="Auction inventories"
      subtitle="File lots into a weekly sale. Relist unsold lots into a new range. Create auctions and terms on Auction desk."
    >
      <HouseCatalogSettings
        settings={
          data.houseSettings ?? {
            defaultStartingBid: DEFAULT_HOUSE_STARTING_BID,
            nextLotNumber: data.suggestedLotNumber ?? "LOT-0001",
          }
        }
        onSave={(next) =>
          void mutate("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "saveHouseSettings",
              defaultStartingBid: next.defaultStartingBid,
              nextLotNumber: next.nextLotNumber,
            }),
          }).then(() => setNotice("Saved house starting bid and next lot #."))
        }
      />
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, consignor, lot #, auction #"
          className="min-w-0 w-full flex-1 border-4 border-black bg-white px-3 py-2 font-comic sm:min-w-[220px]"
        />
        <button
          type="button"
          className={filter === "all" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => setFilter("all")}
        >
          All lots
        </button>
        <button
          type="button"
          className={filter === "unsold" ? "comic-btn" : "comic-btn-invert"}
          onClick={() => setFilter("unsold")}
        >
          Unsold / No-bid
        </button>
        <label className="comic-panel-sm inline-flex items-center gap-2 px-3 py-2 font-comic text-sm font-bold">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived sales
        </label>
        <button
          type="button"
          className="comic-btn"
          onClick={() =>
            void mutate("/api/admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "seed" }),
            }).then((json) => setNotice(`Seeded ${json?.seeded ?? 3} house lots`))
          }
        >
          Bulk seed items
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="comic-btn"
          disabled={!selectedUnsold.length}
          onClick={() => {
            setError(null);
            setRelistError(null);
            setRelistOpen(true);
          }}
        >
          Relist / Repost selected ({selectedUnsold.length})
        </button>
        <button
          type="button"
          className="comic-btn-invert"
          disabled={!selectedCount}
          onClick={() => void deleteLots(Array.from(selectedIds))}
        >
          Delete selected lots ({selectedCount})
        </button>
      </div>
      <AuctionInventories
        events={visibleEvents}
        lots={filteredInventory}
        selectedIds={selectedIds}
        onToggle={toggleOne}
        onToggleGroup={toggleGroup}
        onMoveToSale={setFilingLot}
        onDeleteLot={(lot) => void deleteLots([lot.id])}
        onRemove={(lot) =>
          void mutate("/api/admin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entity: "lot", id: lot.id, remove: true }),
          }).then((json) => {
            if (!json) return;
            const where = json.destination === "settlements" ? "settlements" : "unsold";
            setNotice(`Pulled ${lot.title} off live into ${where}.`);
          })
        }
      />
      <AuctionCalendarModal
        open={Boolean(filingLot)}
        lotLabel={
          filingLot ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ") : "this lot"
        }
        events={upcomingEvents}
        onClose={() => setFilingLot(null)}
        onSelect={(eventId) => void fileLotIntoSale(eventId)}
      />
      <RelistLotsModal
        open={relistOpen}
        count={selectedUnsold.length || selectedCount}
        events={upcomingEvents}
        busy={relistBusy}
        error={relistError}
        onClose={() => !relistBusy && setRelistOpen(false)}
        onConfirm={(eventId, lotStart) => void relistSelected(eventId, lotStart)}
      />
    </AdminShell>
  );
}
