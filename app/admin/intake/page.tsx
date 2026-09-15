"use client";

import { useRef, useState } from "react";
import { AdminAiIntake } from "@/components/AdminAiIntake";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { DEFAULT_HOUSE_STARTING_BID } from "@/lib/houseDesk";
import { HouseCatalogSettings } from "@/components/admin/HouseCatalogSettings";

export default function AdminIntakePage() {
  const { data, setNotice, load, mutate } = useAdminDesk();
  const [filingLot, setFilingLot] = useState<{ id: string; title: string; lotNumber?: string | null } | null>(
    null,
  );
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

  return (
    <AdminShell
      title="AI generator"
      subtitle="Work one photo at a time. When you save or post live, this workspace clears and you pick the auction inventory."
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
      <AdminAiIntake
        workspace
        suggestedLotNumber={data.houseSettings?.nextLotNumber ?? data.suggestedLotNumber ?? "LOT-0001"}
        defaultStartingBid={data.houseSettings?.defaultStartingBid ?? DEFAULT_HOUSE_STARTING_BID}
        consignors={data.consignors ?? []}
        onPosted={async (message, lot) => {
          await load();
          setNotice(message);
          if (lot?.id) setFilingLot(lot);
        }}
      />

      <AuctionCalendarModal
        open={Boolean(filingLot)}
        lotLabel={
          filingLot ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ") : "this lot"
        }
        events={data.events.filter((event) => !event.archivedAt)}
        onClose={() => setFilingLot(null)}
        onSelect={(eventId) => void fileLotIntoSale(eventId)}
      />
    </AdminShell>
  );
}
