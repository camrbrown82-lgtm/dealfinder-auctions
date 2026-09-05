"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LotTimer } from "@/components/LotTimer";
import { LotImage } from "@/components/LotImage";
import {
  CATEGORIES,
  filterLots,
  formatCountdown,
  formatCurrency,
  type AuctionCategory,
  type AuctionLot,
} from "@/lib/utils";

export function LiveGrid({ lots }: { lots: AuctionLot[] }) {
  const [category, setCategory] = useState<AuctionCategory>("All");
  const visible = useMemo(() => filterLots(lots, category), [lots, category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((item) => {
          const active = item === category;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={active ? "comic-btn" : "comic-btn-invert"}
            >
              {item}
            </button>
          );
        })}
      </div>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((lot) => (
          <Link
            key={lot.id}
            href={`/auctions/${lot.slug || lot.id}`}
            className="group"
          >
            <article className="comic-panel overflow-hidden bg-brand-paper transition group-hover:-translate-y-1">
              <div className="relative h-48 w-full border-b-4 border-brand-ink bg-brand-cream">
                <LotImage
                  src={lot.image}
                  alt={lot.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <span className="absolute left-3 top-3 border-4 border-brand-ink bg-brand-red px-2 py-1 font-display text-sm text-brand-paper">
                  {lot.category}
                </span>
              </div>
              <div className="space-y-2 p-4">
                {(lot.lotNumber || lot.auctionNumber) && (
                  <p className="font-comic text-xs font-bold">
                    {lot.auctionNumber ? `${lot.auctionNumber}` : ""}
                    {lot.auctionNumber && lot.lotNumber ? " · " : ""}
                    {lot.lotNumber ? lot.lotNumber : ""}
                  </p>
                )}
                <h2 className="font-display text-2xl leading-tight">{lot.title}</h2>
                <p className="font-comic text-sm">{lot.description}</p>
                <div className="flex items-end justify-between pt-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide">Current bid</p>
                    <p className="font-display text-3xl text-brand-red">
                      {formatCurrency(lot.currentBid)}
                    </p>
                  </div>
                  <LotTimer
                    endsAt={lot.endsAt}
                    fallback={formatCountdown(lot.endsAt)}
                  />
                </div>
              </div>
            </article>
          </Link>
        ))}
      </section>
    </div>
  );
}
