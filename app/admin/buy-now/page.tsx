"use client";

import { useMemo, useState } from "react";
import { LotImage } from "@/components/LotImage";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { isBuyNowChannel } from "@/lib/saleChannel";
import { formatCurrency, lotImages, type AuctionLot } from "@/lib/utils";

export default function AdminBuyNowPage() {
  const { data, setNotice, mutate } = useAdminDesk();
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string; price: string }>>({});

  const lots = useMemo(
    () => data.inventory.filter(isBuyNowChannel),
    [data.inventory],
  );

  function draftFor(lot: AuctionLot) {
    return (
      drafts[lot.id] ?? {
        title: lot.title,
        description: lot.description,
        price: String(lot.buyNowPrice ?? lot.reservePrice ?? lot.currentBid ?? 0),
      }
    );
  }

  async function save(lot: AuctionLot) {
    const draft = draftFor(lot);
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "lot",
        id: lot.id,
        title: draft.title,
        description: draft.description,
        buyNowPrice: Number(draft.price) || 0,
        saleChannel: "buy_now",
      }),
    });
    if (!json) return;
    setNotice(`Saved ${draft.title}.`);
  }

  async function remove(lot: AuctionLot) {
    if (!window.confirm(`Delete ${lot.title} from Buy Now?`)) return;
    const json = await mutate("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteLots", lotIds: [lot.id] }),
    });
    if (!json) return;
    setNotice(`Deleted ${lot.title}.`);
  }

  return (
    <AdminShell
      title="Buy Now"
      subtitle="House-owned items list immediately. Consignor Buy Now requests stay in the consignment pipeline until you approve them."
    >
      <div className="flex flex-wrap gap-2">
        <a href="/api/admin/buy-now/export" className="comic-btn inline-block">
          Export .xlsx
        </a>
      </div>
      {lots.length === 0 ? (
        <p className="comic-panel p-4 font-comic">
          No Buy Now inventory yet. Save warehouse stock to Buy Now, or approve a consignor Buy Now request.
        </p>
      ) : (
        <div className="space-y-4">
          {lots.map((lot) => {
            const draft = draftFor(lot);
            const photo = lotImages(lot)[0];
            return (
              <article key={lot.id} className="comic-panel flex flex-col gap-3 p-4 sm:flex-row">
                {photo ? (
                  <div className="relative h-36 w-full shrink-0 overflow-hidden border-4 border-black bg-white sm:h-40 sm:w-40">
                    <LotImage src={photo} alt={lot.title} fill className="object-cover" sizes="160px" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="font-display text-sm tracking-widest text-brand-red">
                    {(lot.buyNowStatus ?? "listed").toUpperCase()}
                    {lot.paidAt ? " · PAID" : ""}
                    {lot.lotNumber ? ` · ${lot.lotNumber}` : ""}
                  </p>
                  <label className="block font-comic text-sm font-bold">
                    Title
                    <input
                      value={draft.title}
                      onChange={(e) =>
                        setDrafts((current) => ({ ...current, [lot.id]: { ...draft, title: e.target.value } }))
                      }
                      className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="block font-comic text-sm font-bold">
                    Description
                    <textarea
                      value={draft.description}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [lot.id]: { ...draft, description: e.target.value },
                        }))
                      }
                      rows={3}
                      className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="block font-comic text-sm font-bold">
                    Buy now price ($)
                    <input
                      type="number"
                      min={0}
                      value={draft.price}
                      onChange={(e) =>
                        setDrafts((current) => ({ ...current, [lot.id]: { ...draft, price: e.target.value } }))
                      }
                      className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
                    />
                  </label>
                  <p className="font-comic text-sm">
                    Listed {formatCurrency(Number(draft.price) || 0)} · Owner {lot.consignor}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="comic-btn !text-base" onClick={() => void save(lot)}>
                      Save
                    </button>
                    <button type="button" className="comic-btn-invert !text-base" onClick={() => void remove(lot)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
