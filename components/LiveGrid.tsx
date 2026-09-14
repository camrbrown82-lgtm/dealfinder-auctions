"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LotTimer } from "@/components/LotTimer";
import { LotGallery } from "@/components/LotGallery";
import {
  interestScore,
  mergeWinsIntoInterest,
  rankLotsByInterest,
  readInterest,
  type InterestProfile,
} from "@/lib/interest";
import { formatCurrency, isLotOpen, lotImages, type AuctionLot } from "@/lib/utils";
import { defaultSaleId, lotsForSale, type SaleWindowItem } from "@/lib/liveSales";

const VIEW_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
type ViewCount = (typeof VIEW_OPTIONS)[number];
const VIEW_STORAGE_KEY = "dealfinder-live-view";
const GRID_CLASS: Record<ViewCount, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-7",
  8: "lg:grid-cols-8",
  9: "lg:grid-cols-9",
};


function isViewCount(value: number): value is ViewCount {
  return (VIEW_OPTIONS as readonly number[]).includes(value);
}

export function LiveGrid({
  lots,
  sales,
}: {
  lots: AuctionLot[];
  sales: SaleWindowItem[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewCount>(9);
  const [saleId, setSaleId] = useState(() => defaultSaleId(sales) ?? "");
  const [interest, setInterest] = useState<InterestProfile>({
    categories: [],
    consignors: [],
    keywords: [],
    lotIds: [],
  });
  const scroller = useRef<HTMLDivElement>(null);

  const selected = sales.find((item) => item.event.id === saleId) ?? sales[0];

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(VIEW_STORAGE_KEY));
      if (isViewCount(saved)) setView(saved);
    } catch {
      /* ignore */
    }
    setInterest(readInterest());
    void fetch("/api/wins", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json.wins) && json.wins.length) {
          setInterest(mergeWinsIntoInterest(json.wins));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, String(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  const visible = useMemo(() => {
    const pool = lotsForSale(lots, selected);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? pool.filter((lot) => {
          const haystack = [
            lot.title,
            lot.description,
            lot.category,
            lot.consignor,
            lot.lotNumber,
            lot.auctionNumber,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : pool;
    return rankLotsByInterest(filtered, interest);
  }, [lots, selected, query, interest]);

  function scrollByCard(direction: -1 | 1) {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      {sales.length > 0 && (
        <div className="comic-panel p-4">
          <p className="font-display text-lg">Auctions</p>
          <p className="font-comic text-sm">
            Two previous sales, the current sale, and two upcoming — bid live or leave an early bid.
          </p>
          <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
            {sales.map((item) => {
              const active = item.event.id === selected?.event.id;
              const label =
                item.kind === "past" ? "Previous" : item.kind === "live" ? "Live now" : "Upcoming";
              return (
                <button
                  key={item.event.id}
                  type="button"
                  onClick={() => setSaleId(item.event.id)}
                  className={`${active ? "comic-btn" : "comic-btn-invert"} shrink-0 !px-3 !py-2 !text-base`}
                >
                  <span className="block leading-none">{label}</span>
                  <span className="mt-1 block font-comic text-xs font-bold normal-case tracking-normal">
                    {item.event.auctionNumber || item.event.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="comic-panel p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block min-w-0 flex-1">
            <span className="font-display text-lg">Search lots</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, category, lot #, consignor…"
              className="comic-field mt-1 w-full px-3 py-2 text-lg"
              autoComplete="off"
            />
          </label>
          <fieldset className="hidden shrink-0 lg:block">
            <legend className="font-display text-lg">Lots per row</legend>
            <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Lots per row">
              {VIEW_OPTIONS.map((count) => {
                const active = count === view;
                return (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setView(count)}
                    className={active ? "comic-btn !px-2.5 !py-1 !text-lg" : "comic-btn-invert !px-2.5 !py-1 !text-lg"}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
        <p className="mt-3 font-comic text-sm font-bold">
          {visible.length} {visible.length === 1 ? "lot" : "lots"}
          {selected?.kind === "past" ? " from this past sale" : ""}
          {selected?.kind === "upcoming" ? " you can bid on early" : ""}
          {query.trim() ? ` matching "${query.trim()}"` : ""}
          <span className="hidden lg:inline"> · {view} per row</span>
          <span className="lg:hidden"> · one lot at a time</span>
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="comic-panel p-8 text-center font-display text-2xl">
          No lots in this sale yet.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between lg:hidden">
            <button type="button" className="comic-btn-invert !px-3 !py-1 !text-lg" onClick={() => scrollByCard(-1)}>
              Prev
            </button>
            <p className="font-comic text-xs font-bold uppercase">Swipe lots</p>
            <button type="button" className="comic-btn-invert !px-3 !py-1 !text-lg" onClick={() => scrollByCard(1)}>
              Next
            </button>
          </div>

          <section
            ref={scroller}
            className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:items-stretch lg:gap-3 lg:overflow-visible lg:pb-0 ${GRID_CLASS[view]}`}
          >
            {visible.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                forYou={interestScore(lot, interest) >= 5}
                view={view}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function LotCard({
  lot,
  forYou,
  view,
}: {
  lot: AuctionLot;
  forYou: boolean;
  view: ViewCount;
}) {
  const href = `/auctions/${lot.slug || lot.id}`;
  const open = isLotOpen(lot);
  const bidLabel = lot.status === "ended" || !open ? "View lot" : "Bid now";
  const catalogLine = [lot.auctionNumber, lot.lotNumber].filter(Boolean).join(" · ");
  const compact = view >= 6;
  const wide = view <= 2;
  const sizes = `(max-width: 1023px) 100vw, ${Math.round(100 / view)}vw`;
  const photoFrame =
    view === 1
      ? "aspect-[4/3] lg:aspect-[16/10] lg:max-h-64"
      : view === 2
        ? "aspect-[4/3] lg:max-h-52"
        : view <= 4
          ? "aspect-[4/3] lg:aspect-square lg:max-h-44"
          : "aspect-[4/3] lg:aspect-square";

  return (
    <article className="comic-panel flex min-w-0 shrink-0 basis-full snap-center flex-col overflow-hidden lg:h-auto lg:basis-auto">
      <Link href={href} className="block shrink-0">
        <div className={`relative w-full overflow-hidden border-b-4 border-brand-ink bg-brand-cream ${photoFrame}`}>
          <LotGallery
            images={lotImages(lot)}
            alt={lot.title}
            variant={compact ? "compact" : "card"}
            sizes={sizes}
            fit="cover"
          />
          <span className="absolute left-2 top-2 z-20 border-4 border-brand-ink bg-brand-red px-2 py-0.5 font-display text-xs text-brand-paper">
            {lot.category}
          </span>
          {forYou && (
            <span className="absolute right-2 top-2 z-20 border-4 border-brand-ink bg-white px-2 py-0.5 font-display text-[10px] text-brand-ink shadow-comic-red-sm">
              For you
            </span>
          )}
        </div>
      </Link>
      <div className="flex flex-col p-2 lg:p-1.5">
        <p className="h-4 truncate font-comic text-[10px] font-bold leading-4">
          {catalogLine || "\u00a0"}
        </p>
        <Link href={href} className="mt-0.5 block">
          <h2
            className={`line-clamp-2 h-10 font-display text-lg leading-5 ${
              wide ? "lg:h-11 lg:text-xl lg:leading-5" : compact ? "lg:h-8 lg:text-sm lg:leading-4" : "lg:h-10 lg:text-base lg:leading-5"
            }`}
          >
            {lot.title}
          </h2>
        </Link>
        <div className="mt-1 flex items-end justify-between gap-1">
          <div className="min-w-0">
            <p
              className={`truncate font-display text-xl leading-none text-brand-red ${
                wide ? "lg:text-2xl" : compact ? "lg:text-sm" : "lg:text-lg"
              }`}
            >
              {formatCurrency(lot.currentBid)}
            </p>
            <p className="h-4 truncate font-comic text-[10px] font-bold leading-4">
              {lot.buyNowPrice || lot.reservePrice
                ? `Buy now ${formatCurrency(lot.buyNowPrice || lot.reservePrice || 0)}`
                : "\u00a0"}
            </p>
          </div>
          <LotTimer endsAt={lot.endsAt} compact={view >= 3} />
        </div>
        <Link
          href={href}
          className="comic-btn mt-1.5 flex h-9 w-full shrink-0 items-center justify-center !px-2 !py-0 !text-sm lg:h-8 lg:!text-xs"
        >
          {bidLabel}
        </Link>
      </div>
    </article>
  );
}
