"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { ConsignorLedger } from "@/components/admin/ConsignorLedger";
import { ReviewQueue, type ReviewDraft } from "@/components/admin/ReviewQueue";
import { openAuctionEvents } from "@/lib/auctionCalendar";
import type { Consignment } from "@/lib/utils";

export default function AdminConsignmentsPage() {
  const { data, setNotice, mutate } = useAdminDesk();
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [ledgerKey, setLedgerKey] = useState(0);
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
    setLedgerKey((key) => key + 1);
    const lotNo = json.lot?.lotNumber ? `Lot ${json.lot.lotNumber}` : draft.title;
    const onBuyNow = Number(draft.buyNowPrice) > 0 || item.saleChannel === "buy_now";
    setNotice(
      onBuyNow
        ? `Approved ${lotNo} into ${json.auctionLabel ?? "the sale"} and Buy Now.`
        : `Approved ${lotNo} into ${json.auctionLabel ?? "the selected sale"}.`,
    );
  }

  async function setStatus(item: Consignment, draft: ReviewDraft, status: "held" | "rejected") {
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "consignment",
        id: item.id,
        status,
        title: draft.title,
        description: draft.description,
        startingBid: Number(draft.startingBid) || 0,
        buyNowPrice: Number(draft.buyNowPrice) || 0,
        consignorName: draft.consignorName,
      }),
    });
    if (!json) return;
    setLedgerKey((key) => key + 1);
    setNotice(status === "held" ? `On hold: ${draft.title}` : `Rejected: ${draft.title}`);
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
      subtitle="Approve new submissions at the top, then track every consignment by person below."
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="comic-panel space-y-2 p-4">
            <h2 className="font-display text-2xl text-brand-red sm:text-4xl">
              Waiting for approval ({data.queue.length})
            </h2>
            <p className="font-comic text-sm">
              Each submission emails the desk and raises the Notifications badge. Approve one into a
              sale and it moves straight into that consignor&apos;s table below.
            </p>
          </div>
          <ReviewQueue
            queue={data.queue}
            drafts={drafts}
            consignors={data.consignors ?? []}
            onDraft={(id, draft) => setDrafts((current) => ({ ...current, [id]: draft }))}
            onApprove={(item, draft) => void approveItem(item, draft)}
            onHold={(item, draft) => void setStatus(item, draft, "held")}
            onReject={(item, draft) => void setStatus(item, draft, "rejected")}
          />
        </section>
        <ConsignorLedger refreshKey={ledgerKey} />
      </div>
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
