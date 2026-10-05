"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { ReviewQueue, type ReviewDraft } from "@/components/admin/ReviewQueue";
import { openAuctionEvents } from "@/lib/auctionCalendar";
import type { Consignment } from "@/lib/utils";

export default function AdminConsignmentsPage() {
  const { data, setNotice, mutate } = useAdminDesk();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [picking, setPicking] = useState<{ item: Consignment; draft: ReviewDraft } | null>(null);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;

  useEffect(() => {
    setDrafts((current) => {
      const next: Record<string, ReviewDraft> = {};
      for (const item of data.queue) {
        next[item.id] = current[item.id] ?? {
          title: item.title,
          description: item.description ?? "",
          startingBid: String(item.startingBid ?? 5),
          buyNowPrice: String(item.buyNowPrice ?? item.reservePrice ?? 0),
          consignorName: item.consignor ?? "",
        };
      }
      return next;
    });
  }, [data.queue]);

  async function approveItem(item: Consignment, draft: ReviewDraft, eventId?: string) {
    if (!eventId) {
      setPicking({ item, draft });
      return;
    }
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
        saleChannel: Number(draft.buyNowPrice) > 0 || item.saleChannel === "buy_now" ? "buy_now" : "auction",
        eventId,
      }),
    });
    if (!json) return;
    setPicking(null);
    const lotNo = json.lot?.lotNumber ? `Lot ${json.lot.lotNumber}` : draft.title;
    const onBuyNow = Number(draft.buyNowPrice) > 0 || item.saleChannel === "buy_now";
    setNotice(
      onBuyNow
        ? `Approved ${lotNo} into ${json.auctionLabel ?? "the sale"} and Buy Now.`
        : `Approved ${lotNo} into ${json.auctionLabel ?? "the selected sale"}.`,
    );
  }

  async function approveIntoSale(eventId: string) {
    const pending = pickingRef.current;
    if (!pending) return;
    await approveItem(pending.item, pending.draft, eventId);
  }

  const openEvents = openAuctionEvents(data.events);

  return (
    <AdminShell
      title="Consignment pipeline"
      subtitle="Review consignor submissions, then approve them into a sale. Warehouse house stock is cataloged separately."
    >
      <ReviewQueue
        queue={data.queue}
        drafts={drafts}
        consignors={data.consignors ?? []}
        onDraft={(id, draft) => setDrafts((current) => ({ ...current, [id]: draft }))}
        onApprove={(item, draft) => void approveItem(item, draft)}
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
      />
    </AdminShell>
  );
}
