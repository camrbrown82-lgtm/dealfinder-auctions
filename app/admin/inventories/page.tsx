"use client";

import { useMemo, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { AuctionInventories } from "@/components/admin/AuctionInventories";
import { HouseCatalogSettings } from "@/components/admin/HouseCatalogSettings";
import { DEFAULT_HOUSE_STARTING_BID } from "@/lib/houseDesk";
import { listingGradeOf } from "@/lib/listingGrade";
import { lotNeedsRelist } from "@/lib/settlements";
import type { AuctionLot } from "@/lib/utils";

export default function AdminInventoriesPage() {
  const { data, setNotice, mutate } = useAdminDesk();
  const [search, setSearch] = useState("");
  const [filingLot, setFilingLot] = useState<AuctionLot | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.inventory;
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
  }, [data, search]);

  const upcomingEvents = data.events.filter((event) => !event.archivedAt);
  const visibleEvents = showArchived
    ? data.events
    : data.events.filter(
        (event) => !event.archivedAt || filteredInventory.some((lot) => lot.eventId === event.id),
      );

  return (
    <AdminShell
      title="Auction inventories"
      subtitle="File lots into a weekly sale. Create auctions and terms on Auction desk."
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
      <AuctionInventories
        events={visibleEvents}
        lots={filteredInventory}
        onMoveToSale={setFilingLot}
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
    </AdminShell>
  );
}
