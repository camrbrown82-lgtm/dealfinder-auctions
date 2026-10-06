"use client";

import { LotImage } from "@/components/LotImage";
import { OwnerPicker } from "@/components/OwnerPicker";
import { BUY_NOW_MINIMUM, consignorPayAmount, counterOfferError } from "@/lib/buyNowOffer";
import { formatCurrency, type Consignment } from "@/lib/utils";

export type ReviewDraft = {
  title: string;
  description: string;
  startingBid: string;
  buyNowPrice: string;
  listPrice: string;
  counterOffer: string;
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
        const pay = consignorPayAmount(item);
        const draft = drafts[item.id] ?? {
          title: item.title,
          description: item.description ?? "",
          startingBid: String(item.startingBid ?? 0),
          buyNowPrice: String(pay || 0),
          listPrice: String(pay || 0),
          counterOffer: "",
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
  const asked = Number(item.consignorOffer ?? item.buyNowPrice ?? item.reservePrice ?? 0) || 0;
  const paying = consignorPayAmount(item);
  const listing = Number(draft.listPrice) || 0;
  const counter = Number(draft.counterOffer) || 0;
  const counterError = counterOfferError(counter);
  const profit = Math.max(0, Math.round((listing - paying) * 100) / 100);
  const photo = item.imageUrls[0];
  return (
    <article className="comic-panel flex flex-col gap-3 p-4 sm:flex-row">
      {photo ? (
        <div className="relative h-36 w-full shrink-0 overflow-hidden border-4 border-black bg-white sm:h-40 sm:w-40">
          <LotImage src={photo} alt={item.title} fill className="object-cover" sizes="160px" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-3">
        <p className="font-display text-sm tracking-widest text-brand-red">
          {item.saleChannel === "buy_now" ? "BUY NOW PENDING" : item.status.toUpperCase()}
          {item.charity ? " · CHARITY" : ""}
        </p>
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
            step="0.01"
            value={draft.startingBid}
            onChange={(e) => onDraft({ ...draft, startingBid: e.target.value })}
            className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        {paying > 0 ? (
          <div className="space-y-3 border-4 border-black bg-brand-cream p-3">
            <p className="font-comic text-sm">
              {item.counterStatus === "accepted" ? (
                <>
                  They asked <strong>{formatCurrency(asked)}</strong> and accepted the counter. Approving
                  pays them <strong>{formatCurrency(paying)}</strong>.
                </>
              ) : (
                <>
                  They asked to receive <strong>{formatCurrency(paying)}</strong>. Approving pays them
                  that amount.
                </>
              )}{" "}
              Buy Now is {formatCurrency(BUY_NOW_MINIMUM)} minimum. There is no commission. Set the price
              buyers pay. The difference is DealFinder&apos;s profit.
            </p>
            <label className="block font-comic text-sm font-bold">
              Price buyers pay ($)
              <span className="block font-normal">
                At least {formatCurrency(paying)}. The difference ({formatCurrency(profit)}) is
                DealFinder&apos;s profit.
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.listPrice}
                onChange={(e) =>
                  onDraft({ ...draft, listPrice: e.target.value, buyNowPrice: e.target.value })
                }
                className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
              />
            </label>
          </div>
        ) : null}
        {paying > 0 ? (
          <label className="block font-comic text-sm font-bold">
            Counter if you turn this down ($)
            <span className="block font-normal">
              Optional. Type this before Reject. It goes in the rejection email for this item. They
              accept or decline it on their consignments page. Leave it blank for a plain rejection.
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.counterOffer}
              onChange={(e) => onDraft({ ...draft, counterOffer: e.target.value })}
              className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
            />
            {counterError ? <span className="mt-1 block font-normal text-brand-red">{counterError}</span> : null}
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="comic-btn !text-base" onClick={onApprove}>
            {paying > 0 ? "Approve into the sale and Buy Now" : "Approve into a sale"}
          </button>
          <button type="button" className="comic-btn-invert !text-base" onClick={onHold}>
            Hold
          </button>
          <button type="button" className="comic-btn !text-base" onClick={onReject} disabled={Boolean(counterError)}>
            {counter > 0 ? "Reject and send counter" : "Reject"}
          </button>
        </div>
      </div>
    </article>
  );
}
