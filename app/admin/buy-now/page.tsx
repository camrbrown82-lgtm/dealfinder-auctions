"use client";

import { useEffect, useMemo, useState } from "react";
import { LotImage } from "@/components/LotImage";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { EbayDesk } from "@/components/admin/EbayDesk";
import { ListOnEbayButton } from "@/components/admin/ListOnEbayButton";
import { PosterInstallNote } from "@/components/admin/PosterInstallNote";
import { queuePoster } from "@/components/admin/posterClient";
import { isListedBuyNow } from "@/lib/saleChannel";
import { marketplaceJob } from "@/lib/socialPost";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
import { formatCurrency, lotImages, type AuctionLot } from "@/lib/utils";

export default function AdminBuyNowPage() {
  const { data, setNotice, setError, load, mutate } = useAdminDesk();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ebay = params.get("ebay");
    if (!ebay) return;
    const messages: Record<string, string> = {
      connected: "eBay is connected. Listing a Buy Now item reuses this login — you do not sign in per item.",
      login: "Log into admin first, then Connect eBay.",
      denied: "eBay access was denied.",
      state: "eBay connect expired. Press Connect eBay again.",
      error: params.get("detail") || "eBay connect failed.",
    };
    if (ebay === "connected") setNotice(messages.connected);
    else setError(messages[ebay] || messages.error);
    window.history.replaceState({}, "", window.location.pathname);
  }, [setError, setNotice]);
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string; price: string }>>({});
  const [posterMissing, setPosterMissing] = useState(false);
  const [soldUnpaid, setSoldUnpaid] = useState<SettlementInvoiceRecord[]>([]);

  async function loadSold() {
    const response = await fetch("/api/admin/settlements", { credentials: "include", cache: "no-store" });
    const json = (await response.json()) as { invoices?: SettlementInvoiceRecord[] };
    setSoldUnpaid(
      (json.invoices ?? []).filter((row) => !row.eventId && row.payment !== "paid"),
    );
  }

  useEffect(() => {
    void loadSold();
  }, []);

  async function markCash(row: SettlementInvoiceRecord) {
    const response = await fetch("/api/admin/settlements", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markCashPaid", record: row }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(json.error || "Could not mark this Buy Now paid.");
      return;
    }
    setNotice(`${row.name} is marked paid in cash.`);
    await loadSold();
  }

  async function postMarketplace(lot: AuctionLot) {
    const draft = draftFor(lot);
    const result = await queuePoster(marketplaceJob(lot, draft));
    if (result === "missing") {
      setPosterMissing(true);
      return;
    }
    setPosterMissing(false);
    if (result === "profile") {
      setNotice("Open DealFinder Poster options and connect the personal profile you post from, then try again.");
      return;
    }
    if (result === "supabase") {
      setNotice("Open DealFinder Poster options and connect Supabase, then try again.");
      return;
    }
    setNotice(`Marketplace form opened for ${draft.title}. Check it, then press Publish on Facebook.`);
  }

  const lots = useMemo(
    () => data.inventory.filter(isListedBuyNow),
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
      subtitle="Lots with a Buy Now price stay in the live auction and show here. Someone can bid, or pay the Buy Now price and take it off the floor. List on eBay only if you check that box."
    >
      <EbayDesk />
      {soldUnpaid.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl">Sold, still unpaid</h2>
          <p className="font-comic text-sm">Mark these Buy Now invoices paid when the cash comes in.</p>
          {soldUnpaid.map((row) => (
            <article key={row.invoice} className="comic-panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-display text-sm tracking-widest text-brand-red">{row.invoice}</p>
                <p className="font-display text-2xl">{row.name}</p>
                <p className="font-comic text-sm">
                  {row.lots.map((lot) => lot.title).join(", ")} · {formatCurrency(row.total)}
                </p>
              </div>
              <button type="button" className="comic-btn" onClick={() => void markCash(row)}>
                Mark paid in cash
              </button>
            </article>
          ))}
        </section>
      ) : null}
      {lots.length === 0 ? (
        <p className="comic-panel p-4 font-comic">
          No Buy Now inventory yet. Save warehouse stock to Buy Now, or approve a consignor Buy Now request.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="font-comic text-sm">
            Marketplace posts use the DealFinder Poster extension. It reads the lot from Supabase and fills the Facebook
            form on the personal profile signed in to this Chrome window. You press Publish.
          </p>
          {posterMissing ? <PosterInstallNote /> : null}
          <div className="flex flex-wrap items-center gap-2">
            <a href="/api/admin/buy-now/export" className="comic-btn-invert inline-block">
              Download spreadsheet
            </a>
          </div>
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
                    <button type="button" className="comic-btn-invert !text-base" onClick={() => void postMarketplace(lot)}>
                      Fill Marketplace form
                    </button>
                    <button type="button" className="comic-btn-invert !text-base" onClick={() => void remove(lot)}>
                      Delete
                    </button>
                  </div>
                  <ListOnEbayButton
                    lot={lot}
                    onDone={(message) => {
                      setNotice(message);
                      void load();
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
