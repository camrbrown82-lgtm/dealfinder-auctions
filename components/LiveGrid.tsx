"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LotTimer } from "@/components/LotTimer";
import { LotGallery } from "@/components/LotGallery";
import { formatCurrency, lotImages, searchLots, type AuctionLot } from "@/lib/utils";

const VIEW_OPTIONS = [1, 3, 6, 9, 12] as const;
type ViewCount = (typeof VIEW_OPTIONS)[number];

const VIEW_STORAGE_KEY = "dealfinder-live-view";

const GRID_CLASS: Record<ViewCount, string> = {
  1: "grid-cols-1",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  6: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
  9: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9",
  12: "grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12",
};

function isViewCount(value: number): value is ViewCount {
  return (VIEW_OPTIONS as readonly number[]).includes(value);
}

export function LiveGrid({ lots }: { lots: AuctionLot[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewCount>(3);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(VIEW_STORAGE_KEY));
      if (isViewCount(saved)) setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, String(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  const visible = useMemo(() => searchLots(lots, query), [lots, query]);
  const compact = view >= 6;
  const oneUp = view === 1;

  return (
    <div className="space-y-4">
      <div className="comic-panel bg-brand-paper p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block min-w-0 flex-1">
            <span className="font-display text-lg">Search lots</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, category, lot #, consignor…"
              className="mt-1 w-full border-4 border-brand-ink bg-brand-cream px-3 py-2 font-comic text-lg outline-none focus:bg-white"
              autoComplete="off"
            />
          </label>

          <fieldset className="shrink-0">
            <legend className="font-display text-lg">Lots per row</legend>
            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Lots per row">
              {VIEW_OPTIONS.map((count) => {
                const active = count === view;
                return (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setView(count)}
                    className={active ? "comic-btn !px-3 !py-1 !text-lg" : "comic-btn-invert !px-3 !py-1 !text-lg"}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
        <p className="mt-3 font-comic text-sm font-bold">
          {visible.length} live {visible.length === 1 ? "lot" : "lots"}
          {query.trim() ? ` matching "${query.trim()}"` : ""}
          {oneUp ? " · scrolling one at a time" : ` · ${view} across on wide screens`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="comic-panel bg-brand-paper p-8 text-center font-display text-2xl">
          No lots match that search.
        </p>
      ) : (
        <section
          className={`grid gap-4 ${GRID_CLASS[view]} ${oneUp ? "max-w-3xl mx-auto snap-y snap-mandatory" : ""}`}
        >
          {visible.map((lot) => (
            <Link
              key={lot.id}
              href={`/auctions/${lot.slug || lot.id}`}
              className={`group ${oneUp ? "snap-start" : ""}`}
            >
              <article className="comic-panel h-full overflow-hidden bg-brand-paper transition group-hover:-translate-y-1">
                <div
                  className={`relative w-full border-b-4 border-brand-ink bg-brand-cream ${
                    oneUp ? "h-80" : compact ? "h-24 sm:h-28" : "h-48"
                  }`}
                >
                  <LotGallery
                    images={lotImages(lot)}
                    alt={lot.title}
                    variant={compact ? "compact" : "card"}
                    sizes={
                      oneUp
                        ? "768px"
                        : compact
                          ? "(max-width: 1280px) 25vw, 10vw"
                          : "(max-width: 768px) 100vw, 33vw"
                    }
                  />
                  {!compact && (
                    <span className="absolute left-3 top-3 z-20 border-4 border-brand-ink bg-brand-red px-2 py-1 font-display text-sm text-brand-paper">
                      {lot.category}
                    </span>
                  )}
                </div>
                <div className={compact ? "space-y-1 p-2" : "space-y-2 p-4"}>
                  {(lot.lotNumber || lot.auctionNumber) && (
                    <p className={`font-comic font-bold ${compact ? "truncate text-[10px]" : "text-xs"}`}>
                      {lot.auctionNumber ? `${lot.auctionNumber}` : ""}
                      {lot.auctionNumber && lot.lotNumber ? " · " : ""}
                      {lot.lotNumber ? lot.lotNumber : ""}
                    </p>
                  )}
                  <h2
                    className={`font-display leading-tight ${
                      compact ? "line-clamp-2 text-sm sm:text-base" : oneUp ? "text-4xl" : "text-2xl"
                    }`}
                  >
                    {lot.title}
                  </h2>
                  {!compact && (
                    <p className="font-comic text-sm">{lot.description}</p>
                  )}
                  <div
                    className={`flex items-end justify-between gap-1 ${compact ? "pt-1" : "pt-2"}`}
                  >
                    <div className="min-w-0">
                      {!compact && (
                        <p className="text-xs uppercase tracking-wide">Current bid</p>
                      )}
                      <p
                        className={`font-display text-brand-red ${
                          compact ? "truncate text-sm sm:text-lg" : "text-3xl"
                        }`}
                      >
                        {formatCurrency(lot.currentBid)}
                      </p>
                    </div>
                    <LotTimer endsAt={lot.endsAt} compact={compact} />
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
