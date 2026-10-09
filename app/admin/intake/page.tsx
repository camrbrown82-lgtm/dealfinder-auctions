"use client";

import { useEffect, useRef, useState } from "react";
import { AdminAiIntake } from "@/components/AdminAiIntake";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { HouseCatalogSettings } from "@/components/admin/HouseCatalogSettings";
import { DEFAULT_HOUSE_STARTING_BID } from "@/lib/houseDesk";
import { salesOpenForPosting } from "@/lib/liveSales";

const DEFAULT_AUCTION_KEY = "df_warehouse_default_auction";

export default function AdminWarehouseIntakePage() {
  const { data, setNotice, load, mutate } = useAdminDesk();
  const [filingLot, setFilingLot] = useState<{ id: string; title: string; lotNumber?: string | null } | null>(
    null,
  );
  const [defaultEventId, setDefaultEventId] = useState("");
  const filingLotRef = useRef(filingLot);
  filingLotRef.current = filingLot;

  async function fileLotIntoSale(eventId: string) {
    const lot = filingLotRef.current;
    if (!lot) return;
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "lot", id: lot.id, eventId, status: "live" }),
    });
    if (!json) return;
    setFilingLot(null);
    setNotice(`Filed ${lot.title} into the selected auction.`);
  }

  useEffect(() => {
    setDefaultEventId(window.localStorage.getItem(DEFAULT_AUCTION_KEY) ?? "");
  }, []);

  const openEvents = salesOpenForPosting(data.events);
  const filingEventId = openEvents.some((event) => event.id === defaultEventId) ? defaultEventId : "";

  function chooseDefaultAuction(eventId: string) {
    setDefaultEventId(eventId);
    if (eventId) window.localStorage.setItem(DEFAULT_AUCTION_KEY, eventId);
    else window.localStorage.removeItem(DEFAULT_AUCTION_KEY);
  }

  return (
    <AdminShell
      title="Warehouse AI generator"
      subtitle="House-owned warehouse stock. Catalog photos, generate a listing, then file into a sale. No consignor commission."
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
      <label className="comic-panel block p-4 font-comic font-bold">
        Default auction
        <select
          value={filingEventId}
          onChange={(e) => chooseDefaultAuction(e.target.value)}
          className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
        >
          <option value="">Ask me each time</option>
          {openEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {event.auctionNumber ? `${event.auctionNumber} · ` : ""}
              {event.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block font-normal text-sm">
          New warehouse lots file into this sale until you pick a different one.
        </span>
      </label>
      <AdminAiIntake
        workspace
        suggestedLotNumber={data.houseSettings?.nextLotNumber ?? data.suggestedLotNumber ?? "LOT-0001"}
        defaultStartingBid={data.houseSettings?.defaultStartingBid ?? DEFAULT_HOUSE_STARTING_BID}
        defaultEventId={filingEventId}
        onPosted={async (message, lot) => {
          await load();
          setNotice(message);
          if (lot?.id && !filingEventId) setFilingLot(lot);
        }}
      />
      <AuctionCalendarModal
        open={Boolean(filingLot)}
        lotLabel={filingLot ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ") : "this lot"}
        events={openEvents}
        onClose={() => setFilingLot(null)}
        onSelect={(eventId) => void fileLotIntoSale(eventId)}
      />
    </AdminShell>
  );
}
