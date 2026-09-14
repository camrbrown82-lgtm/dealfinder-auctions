"use client";

import { useEffect, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { ReviewQueue, type ReviewDraft } from "@/components/admin/ReviewQueue";
import { weeklySaleName, weeklySaleTimes } from "@/lib/auctionCalendar";

export default function AdminReviewPage() {
  const { data, setNotice, mutate } = useAdminDesk();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [filingLot, setFilingLot] = useState<{ id: string; title: string; lotNumber?: string | null } | null>(
    null,
  );

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

  async function fileLotIntoSale(eventId: string) {
    if (!filingLot) return;
    const lot = filingLot;
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "lot", id: lot.id, eventId }),
    });
    if (!json) return;
    setFilingLot(null);
    setNotice(`Filed ${lot.title} into the selected auction.`);
  }

  return (
    <AdminShell
      title="Consignment review"
      subtitle="Pending and held items only. Approve them into inventory, then pick the sale."
    >
      <ReviewQueue
        queue={data.queue}
        drafts={drafts}
        consignors={data.consignors ?? []}
        onDraft={(id, draft) => setDrafts((current) => ({ ...current, [id]: draft }))}
        onApprove={(item, draft) =>
          void mutate("/api/admin", {
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
            }),
          }).then((json) => {
            if (!json) return;
            const lot = json.lot as { id: string; title: string; lotNumber?: string | null } | undefined;
            const lotNo = lot?.lotNumber ? `Lot ${lot.lotNumber}` : "warehouse lot";
            setNotice(`Approved ${lotNo}. Pick the sale.`);
            if (lot?.id) setFilingLot(lot);
          })
        }
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
        open={Boolean(filingLot)}
        lotLabel={
          filingLot ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ") : "this lot"
        }
        events={data.events}
        onClose={() => setFilingLot(null)}
        onSelect={(eventId) => void fileLotIntoSale(eventId)}
        onScheduleDay={(day) => {
          const times = weeklySaleTimes(day);
          void mutate("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "createEvent",
              name: weeklySaleName(day),
              auctionNumber: data.suggestedAuctionNumber,
              startsAt: times.startsAt,
              endsAt: times.endsAt,
            }),
          }).then((json) => {
            const createdId = json?.event?.id as string | undefined;
            if (createdId) void fileLotIntoSale(createdId);
          });
        }}
      />
    </AdminShell>
  );
}
