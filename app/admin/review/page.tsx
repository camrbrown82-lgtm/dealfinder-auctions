"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { ReviewQueue, type ReviewDraft } from "@/components/admin/ReviewQueue";
import { openAuctionEvents, weeklySaleName, weeklySaleTimes } from "@/lib/auctionCalendar";
import type { Consignment } from "@/lib/utils";

export default function AdminReviewPage() {
  const { data, setNotice, setError, mutate } = useAdminDesk();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [picking, setPicking] = useState<{ item: Consignment; draft: ReviewDraft } | null>(null);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;

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

  const openEvents = openAuctionEvents(data.events);

  return (
    <AdminShell
      title="Consignment review"
      subtitle="Approve into an upcoming sale. August and other ended weeks are hidden here."
    >
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
        open={Boolean(picking)}
        lotLabel={picking ? picking.draft.title : "this lot"}
        events={openEvents}
        onClose={() => setPicking(null)}
        onSelect={(eventId) => void approveIntoSale(eventId)}
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
            if (createdId) {
              void approveIntoSale(createdId);
              return;
            }
            setError("Could not create that sale week. Try another day.");
          });
        }}
      />
    </AdminShell>
  );
}
