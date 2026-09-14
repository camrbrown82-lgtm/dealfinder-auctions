"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LotTimer } from "@/components/LotTimer";
import { LotGallery } from "@/components/LotGallery";
import {
  interestScore,
  mergeWinsIntoInterest,
  rankLotsByInterest,
  readInterest,
  type InterestProfile,
} from "@/lib/interest";
import { listingGradeOf } from "@/lib/listingGrade";
import { lotWasSold } from "@/lib/settlements";
import { formatCurrency, isLotOpen, lotImages, type AuctionLot } from "@/lib/utils";
import { defaultSaleId, lotsForSale, type SaleWindowItem } from "@/lib/liveSales";

const VIEW_OPTIONS = [1, 4, 6, 9] as const;
type ViewCount = (typeof VIEW_OPTIONS)[number];
const VIEW_STORAGE_KEY = "dealfinder-live-view";
const GRID_CLASS: Record<ViewCount, string> = {
  1: "grid grid-cols-1 gap-4",
  4: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
  6: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
  9: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9",
};

type LotClock = {
  currentBid: number;
  endsAt: string;
  highBidder: string | null;
  status: AuctionLot["status"];
};

function normalizeView(value: number): ViewCount {
  if (value === 1 || value === 4 || value === 6 || value === 9) return value;
  if (value <= 3) return 1;
  if (value <= 5) return 4;
  if (value <= 7) return 6;
  return 9;
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
  const [clocks, setClocks] = useState<Record<string, LotClock> | null>(null);
  const [interest, setInterest] = useState<InterestProfile>({
    categories: [],
    consignors: [],
    keywords: [],
    lotIds: [],
  });

  const selected = sales.find((item) => item.event.id === saleId) ?? sales[0];

  useEffect(() => {
    try {
      setView(normalizeView(Number(window.localStorage.getItem(VIEW_STORAGE_KEY))));
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

  useEffect(() => {
    let cancelled = false;
    async function pullClocks() {
      try {
        const response = await fetch("/api/live-clock", { cache: "no-store" });
        const json = await response.json();
        if (cancelled || !Array.isArray(json.lots)) return;
        const next: Record<string, LotClock> = {};
        for (const row of json.lots as Array<LotClock & { id: string }>) {
          next[row.id] = {
            currentBid: row.currentBid,
            endsAt: row.endsAt,
            highBidder: row.highBidder,
            status: row.status,
          };
        }
        setClocks(next);
      } catch {
        /* keep last clocks */
      }
    }
    void pullClocks();
    const id = window.setInterval(() => void pullClocks(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const visible = useMemo(() => {
    const clockMap = clocks ?? {};
    const clockReady = clocks !== null;
    const merged = lots
      .map((lot) => {
        const clock = clockMap[lot.id];
        if (!clock) return lot;
        return {
          ...lot,
          currentBid: clock.currentBid,
          endsAt: clock.endsAt,
          highBidder: clock.highBidder,
          status: clock.status ?? lot.status,
        };
      })
      .filter((lot) => {
        if (lot.status === "removed" || lot.status === "draft" || lot.status === "ended") return false;
        if (lotWasSold(lot)) return false;
        if (clockReady && clockMap[lot.id] && (clockMap[lot.id].status === "ended" || clockMap[lot.id].status === "removed")) {
          return false;
        }
        if (clockReady && !clockMap[lot.id]) return false;
        return true;
      });
    const pool = lotsForSale(merged, selected);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? pool.filter((lot) => {
          const haystack = [
            lot.title,
            lot.description,
            listingGradeOf(lot),
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
  }, [lots, selected, query, interest, clocks]);

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-clip">
      {sales.length > 0 && (
        <div className="comic-panel p-4">
          <p className="font-display text-lg">Auctions</p>
          <p className="font-comic text-sm">
            This week&apos;s sale is on Live. Open another auction to see only that sale&apos;s lots.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sales.map((item) => {
              const active = item.event.id === selected?.event.id;
              const label =
                item.kind === "past" ? "Previous" : item.kind === "live" ? "Live now" : "Upcoming";
              return (
                <button
                  key={item.event.id}
                  type="button"
                  onClick={() => setSaleId(item.event.id)}
                  className={`${active ? "comic-btn" : "comic-btn-invert"} max-w-full !px-3 !py-2 !text-base`}
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
              placeholder="Title, Used/New/Issues, lot #, consignor…"
              className="comic-field mt-1 w-full min-w-0 max-w-full px-3 py-2 text-lg"
              autoComplete="off"
            />
          </label>
          <fieldset className="min-w-0 shrink-0">
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
          <span className="lg:inline"> · {view} per row</span>
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="comic-panel p-8 text-center font-display text-2xl">
          No lots in this sale yet.
        </p>
      ) : (
        <section className={GRID_CLASS[view]}>
          {visible.map((lot) => (
            <LotCard
              key={lot.id}
              lot={lot}
              forYou={interestScore(lot, interest) >= 5}
              view={view}
            />
          ))}
        </section>
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
  const href = `/auctions/${lot.id}`;
  const open = isLotOpen(lot);
  const bidLabel = open ? "Bid now" : "View lot";
  const catalogLine = [lot.auctionNumber, lot.lotNumber].filter(Boolean).join(" · ");
  const compact = view >= 6;
  const single = view === 1;
  const sizes = single
    ? "176px"
    : `(max-width: 1023px) 100vw, ${Math.round(100 / view)}vw`;

  return (
    <article
      className={
        single
          ? "comic-panel flex min-w-0 w-full flex-col overflow-hidden sm:flex-row"
          : "comic-panel flex min-w-0 w-full flex-col overflow-hidden"
      }
    >
      <div
        className={
          single
            ? "relative h-48 w-full shrink-0 overflow-hidden border-b-4 border-brand-ink bg-brand-cream sm:h-44 sm:w-44 sm:border-b-0 sm:border-r-4"
            : "relative aspect-square w-full overflow-hidden border-b-4 border-brand-ink bg-brand-cream"
        }
      >
        <Link href={href} className="absolute inset-0 z-0" aria-label={lot.title} />
        <LotGallery
          images={lotImages(lot)}
          alt={lot.title}
          variant={compact || single ? "compact" : "card"}
          sizes={sizes}
          fit="cover"
        />
        <span className="pointer-events-none absolute left-2 top-2 z-20 border-4 border-brand-ink bg-brand-red px-2 py-0.5 font-display text-xs text-brand-paper">
          {listingGradeOf(lot)}
        </span>
        {forYou && (
          <span className="pointer-events-none absolute right-2 top-2 z-20 border-4 border-brand-ink bg-white px-2 py-0.5 font-display text-[10px] text-brand-ink shadow-comic-red-sm">
            For you
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-2 lg:p-1.5">
        <p className="h-4 truncate font-comic text-[10px] font-bold leading-4">
          {catalogLine || "\u00a0"}
        </p>
        <Link href={href} className="mt-0.5 block">
          <h2
            className={`line-clamp-2 h-10 font-display text-lg leading-5 ${
              compact ? "lg:h-8 lg:text-sm lg:leading-4" : "lg:h-10 lg:text-base lg:leading-5"
            }`}
          >
            {lot.title}
          </h2>
        </Link>
        <div className="mt-1 flex items-end justify-between gap-1">
          <div className="min-w-0">
            <p
              className={`truncate font-display text-xl leading-none text-brand-red ${
                compact ? "lg:text-sm" : "lg:text-lg"
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
          <LotTimer endsAt={lot.endsAt} compact />
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
