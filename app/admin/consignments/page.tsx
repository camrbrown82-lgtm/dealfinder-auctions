"use client";

import { useEffect, useRef, useState } from "react";
import { AdminAiIntake } from "@/components/AdminAiIntake";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { HouseCatalogSettings } from "@/components/admin/HouseCatalogSettings";
import { ReviewQueue, type ReviewDraft } from "@/components/admin/ReviewQueue";
import { DEFAULT_HOUSE_STARTING_BID } from "@/lib/houseDesk";
import type { Consignment } from "@/lib/utils";

export default function AdminConsignmentsPage() {
  const { data, setNotice, load, mutate } = useAdminDesk();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [picking, setPicking] = useState<{ item: Consignment; draft: ReviewDraft } | null>(null);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const [filingLot, setFilingLot] = useState<{ id: string; title: string; lotNumber?: string | null } | null>(
    null,
  );
  const filingLotRef = useRef(filingLot);
  filingLotRef.current = filingLot;

  useEffect(() => {
    const next: Record<string, ReviewDraft> = {};
    for (const item of data.queue) {
      next[item.id] = {
        title: item.title,
        description: item.description ?? "",
        startingBid: String(item.startingBid ?? 0),
        buyNowPrice: String(item.buyNowPrice ?? item.reservePrice ?? 0),
        consignorName: item.consignor ?? "",
      };
    }
    setDrafts(next);
  }, [data.queue]);

  async function approveIntoSale(eventId: string) {
    const pending = pickingRef.current;
    if (!pending) return;
    const { item, draft } = pending;
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "consignment",
        id: item.id,
        status: "approved",
        title: draft.title,
        description: draft.description,
        startingBid: Number(draft.startingBid) || 0,
        buyNowPrice: Number(draft.buyNowPrice) || 0,
        consignorName: draft.consignorName,
        eventId,
      }),
    });
    if (!json) return;
    setPicking(null);
    const lotNo = json.lot?.lotNumber ? `Lot ${json.lot.lotNumber}` : draft.title;
    setNotice(`Approved ${lotNo} into ${json.auctionLabel ?? "the selected sale"}.`);
  }

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

  const openEvents = data.events.filter((event) => !event.archivedAt);

  return (
    <AdminShell
      title="Consignment pipeline"
      subtitle="Upload and generate a listing, then review and approve into inventory. One workflow."
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
      <ReviewQueue
        queue={data.queue}
        drafts={drafts}
        consignors={data.consignors ?? []}
        onDraft={(id, draft) => setDrafts((current) => ({ ...current, [id]: draft }))}
        onApprove={(item, draft) => setPicking({ item, draft })}
        onHold={(item, draft) =>
          void mutate("/api/admin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity: "consignment",
              id: item.id,
              status: "held",
              title: draft.title,
              description: draft.description,
              startingBid: Number(draft.startingBid) || 0,
              buyNowPrice: Number(draft.buyNowPrice) || 0,
              consignorName: draft.consignorName,
            }),
          })
        }
        onReject={(item, draft) =>
          void mutate("/api/admin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity: "consignment",
              id: item.id,
              status: "rejected",
              title: draft.title,
              description: draft.description,
              startingBid: Number(draft.startingBid) || 0,
              buyNowPrice: Number(draft.buyNowPrice) || 0,
              consignorName: draft.consignorName,
            }),
          }).then(() => setNotice(`Rejected: ${draft.title}`))
        }
      />
      <AuctionCalendarModal
        open={Boolean(picking) || Boolean(filingLot)}
        lotLabel={
          picking
            ? picking.draft.title
            : filingLot
              ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ")
              : "this lot"
        }
        events={openEvents}
        onClose={() => {
          setPicking(null);
          setFilingLot(null);
        }}
        onSelect={(eventId) => {
          if (pickingRef.current) void approveIntoSale(eventId);
          else void fileLotIntoSale(eventId);
        }}
      />
    </AdminShell>
  );
}
