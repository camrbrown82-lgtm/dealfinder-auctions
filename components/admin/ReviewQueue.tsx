"use client";

import { LotImage } from "@/components/LotImage";
import { OwnerPicker } from "@/components/OwnerPicker";
import type { Consignment } from "@/lib/utils";

export type ReviewDraft = {
  title: string;
  description: string;
  startingBid: string;
  buyNowPrice: string;
  consignorName: string;
};

export function ReviewQueue({
  queue,
  drafts,
  consignors,
  onDraft,
  onApprove,
  onHold,
  onReject,
}: {
  queue: Consignment[];
  drafts: Record<string, ReviewDraft>;
  consignors: string[];
  onDraft: (id: string, draft: ReviewDraft) => void;
  onApprove: (item: Consignment, draft: ReviewDraft) => void;
  onHold: (item: Consignment, draft: ReviewDraft) => void;
  onReject: (item: Consignment, draft: ReviewDraft) => void;
}) {
  if (queue.length === 0) {
    return (
      <p className="comic-panel p-4 font-comic">
        Queue is clear. New consignor submissions will show up here until you approve them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {queue.map((item) => {
        const draft = drafts[item.id] ?? {
          title: item.title,
          description: item.description ?? "",
          startingBid: String(item.startingBid ?? 0),
          buyNowPrice: String(item.buyNowPrice ?? item.reservePrice ?? 0),
          consignorName: item.consignor ?? "",
        };
        return (
          <ReviewCard
            key={item.id}
            item={item}
            draft={draft}
            consignors={consignors}
            onDraft={(next) => onDraft(item.id, next)}
            onApprove={() => onApprove(item, draft)}
            onHold={() => onHold(item, draft)}
            onReject={() => onReject(item, draft)}
          />
        );
      })}
    </div>
  );
}

function ReviewCard({
  item,
  draft,
  consignors,
  onDraft,
  onApprove,
  onHold,
  onReject,
}: {
  item: Consignment;
  draft: ReviewDraft;
  consignors: string[];
  onDraft: (draft: ReviewDraft) => void;
  onApprove: () => void;
  onHold: () => void;
  onReject: () => void;
}) {
  const photo = item.imageUrls[0];
  return (
    <article className="comic-panel flex flex-col gap-3 p-4 sm:flex-row">
      {photo ? (
        <div className="relative h-36 w-full shrink-0 overflow-hidden border-4 border-black bg-white sm:h-40 sm:w-40">
          <LotImage src={photo} alt={item.title} fill className="object-cover" sizes="160px" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-3">
        <p className="font-display text-sm tracking-widest text-brand-red">{item.status.toUpperCase()}</p>
        <OwnerPicker
          value={draft.consignorName ?? ""}
          consignors={consignors}
          onChange={(name) => onDraft({ ...draft, consignorName: name })}
        />
        <label className="block font-comic text-sm font-bold">
          Title
          <input
            value={draft.title}
            onChange={(e) => onDraft({ ...draft, title: e.target.value })}
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic text-sm font-bold">
          Description
          <textarea
            value={draft.description}
            onChange={(e) => onDraft({ ...draft, description: e.target.value })}
            rows={3}
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic text-sm font-bold">
          Starting bid ($)
          <input
            type="number"
            min={0}
            value={draft.startingBid}
            onChange={(e) => onDraft({ ...draft, startingBid: e.target.value })}
            className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic text-sm font-bold">
          Buy now ($)
          <input
            type="number"
            min={0}
            value={draft.buyNowPrice}
            onChange={(e) => onDraft({ ...draft, buyNowPrice: e.target.value })}
            className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="comic-btn !text-base" onClick={onApprove}>
            Approve into a sale
          </button>
          <button type="button" className="comic-btn-invert !text-base" onClick={onHold}>
            Hold
          </button>
          <button type="button" className="comic-btn !text-base" onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}
