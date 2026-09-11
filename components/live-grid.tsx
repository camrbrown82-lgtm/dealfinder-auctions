"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { countdown, filterLiveLots, lotImages, money } from "@/lib/catalog";
import type { Lot } from "@/lib/types";
import { LotGallery } from "./lot-gallery";

const VIEW_KEY = "dealfinder-live-view";

const densities = [
  { id: "1", label: "1", className: "grid-cols-1", compact: false },
  { id: "3", label: "3", className: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", compact: false },
  { id: "6", label: "6", className: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6", compact: true },
  { id: "9", label: "9", className: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9", compact: true },
  { id: "12", label: "12", className: "grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12", compact: true },
] as const;

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const value = countdown(endsAt, now);
  return <span className={value === "ENDED" ? "text-brand-red" : ""}>{value}</span>;
}

export function LiveGrid({ lots }: { lots: Lot[] }) {
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<(typeof densities)[number]["id"]>("3");

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved && densities.some((row) => row.id === saved)) setDensity(saved as typeof density);
  }, []);

  function choose(id: (typeof densities)[number]["id"]) {
    setDensity(id);
    window.localStorage.setItem(VIEW_KEY, id);
  }

  const view = densities.find((row) => row.id === density) ?? densities[1];
  const visible = useMemo(() => filterLiveLots(lots, query), [lots, query]);
  const compact = view.compact;
  const snap = density === "1";

  return (
    <div className="text-brand-black">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1 font-comic text-sm font-bold">
          Search lots
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, consignor, lot #, BAM…"
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            autoComplete="off"
          />
        </label>
        <div>
          <p className="font-comic text-sm font-bold" aria-label="Lots per row">
            Lots per row
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {densities.map((row) => (
              <button
                key={row.id}
                type="button"
                aria-pressed={density === row.id}
                className={density === row.id ? "comic-btn !px-3 !py-1 !text-lg" : "comic-btn-invert !px-3 !py-1 !text-lg"}
                onClick={() => choose(row.id)}
              >
                {row.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mb-4 font-comic text-sm font-bold">
        {visible.length} {visible.length === 1 ? "lot" : "lots"}
        {query.trim() ? " matching" : " live"}
        {snap ? " · scrolling one at a time" : ` · ${density} across on wide screens`}
      </p>
      {visible.length === 0 ? (
        <p className="comic-panel p-6 font-comic font-bold">No lots match that search.</p>
      ) : (
        <div className={`grid gap-4 ${view.className} ${snap ? "mx-auto snap-y snap-mandatory" : ""}`}>
          {visible.map((lot) => (
            <Link
              key={lot.id}
              href={`/auctions/${lot.slug || lot.id}`}
              className={`group comic-panel overflow-hidden bg-white ${snap ? "snap-start" : ""}`}
            >
              <div className="relative">
                <LotGallery
                  images={lotImages(lot)}
                  alt={lot.title}
                  variant={compact ? "compact" : "card"}
                  sizes={compact ? "(max-width: 1280px) 25vw, 10vw" : "(max-width: 768px) 100vw, 33vw"}
                />
                <span className="absolute left-2 top-2 border-4 border-black bg-brand-red px-2 py-0.5 font-display text-lg uppercase text-white">
                  {lot.category}
                </span>
              </div>
              <div className={compact ? "space-y-1 p-2" : "space-y-2 p-4"}>
                <p className="font-comic text-xs font-bold">
                  {lot.auctionNumber}
                  {lot.auctionNumber && lot.lotNumber ? " · " : ""}
                  {lot.lotNumber}
                </p>
                <h2 className={`font-display uppercase leading-none ${compact ? "text-2xl" : "text-4xl"}`}>{lot.title}</h2>
                {!compact && <p className="font-comic text-sm">{lot.description}</p>}
                <div className="flex items-end justify-between gap-2">
                  <div>
                    {!compact && <p className="font-comic text-xs font-bold uppercase">Current bid</p>}
                    <p className={`font-display text-brand-red ${compact ? "text-2xl" : "text-3xl"}`}>{money(lot.currentBid)}</p>
                  </div>
                  <p className="font-display text-xl">
                    <Countdown endsAt={lot.endsAt} />
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
