"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { moneySplit } from "@/lib/commission";
import { collectItemImageUrls } from "@/lib/files";
import { parsePastedImageUrls } from "@/lib/imageUrls";
import {
  CATEGORIES,
  DEFAULT_COMMISSION_RATE,
  formatCurrency,
  type AuctionEvent,
  type LotCategory,
} from "@/lib/utils";

const categories = CATEGORIES.filter((item): item is LotCategory => item !== "All");

export function AdminAiIntake({
  events,
  suggestedLotNumber,
  onPosted,
}: {
  events: AuctionEvent[];
  suggestedLotNumber: string;
  onPosted: (message: string) => Promise<void> | void;
}) {
  const [consignorName, setConsignorName] = useState("House stock");
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrlText, setImageUrlText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<LotCategory>("Oddities");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [lotNumber, setLotNumber] = useState(suggestedLotNumber);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLotNumber(suggestedLotNumber);
  }, [suggestedLotNumber]);

  const commissionRate = Number(commissionPercent) / 100 || DEFAULT_COMMISSION_RATE;
  const start = Number(startingBid) || 0;
  const reserve = Number(reservePrice) || 0;
  const market = Number(marketValue) || 0;
  const breakdown = useMemo(
    () => ({
      start: moneySplit(start, commissionRate),
      reserve: moneySplit(reserve, commissionRate),
      market: moneySplit(market, commissionRate),
    }),
    [start, reserve, market, commissionRate],
  );

  async function autoGenerate() {
    setError(null);
    if (files.length === 0 && parsePastedImageUrls(imageUrlText).length === 0) {
      setError("Add a photo or paste an image URL first.");
      return;
    }
    setGenerating(true);
    try {
      const imageUrls = await collectItemImageUrls(files, imageUrlText, { fallbackDataUrl: true });
      const response = await fetch("/api/ai-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "AI intake failed");
      setTitle(String(json.title ?? ""));
      setDescription(String(json.description ?? ""));
      if (json.suggested_starting_bid) setStartingBid(String(json.suggested_starting_bid));
      if (json.estimated_market_value) {
        setMarketValue(String(json.estimated_market_value));
        if (!reservePrice) setReservePrice(String(json.estimated_market_value));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI intake failed");
    } finally {
      setGenerating(false);
    }
  }

  async function submit(postLive: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const imageUrls = await collectItemImageUrls(files, imageUrlText);
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createLot",
          consignorName,
          title,
          description,
          category,
          startingBid: start,
          reservePrice: reserve,
          commissionRate,
          imageUrls,
          lotNumber,
          eventId: eventId || undefined,
          postLive,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not save lot.");
      setTitle("");
      setDescription("");
      setStartingBid("");
      setReservePrice("");
      setMarketValue("");
      setFiles([]);
      setImageUrlText("");
      await onPosted(
        postLive
          ? `Posted ${lotNumber} live to the site.`
          : `Saved ${lotNumber} to inventory (paused).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lot.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submit(false);
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-3xl">Post inventory with AI</h2>
      <p className="font-comic text-sm">
        Same photo + GPT-4o catalog as consignors. Assign a lot # and auction, then save
        or post live to the public grid.
      </p>
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 border-4 border-black bg-white p-5 shadow-[6px_6px_0_0_#000]">
          <label className="block font-comic font-bold">
            Consignor / house
            <input
              value={consignorName}
              onChange={(e) => setConsignorName(e.target.value)}
              required
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            />
          </label>
          <PhotoDropzone files={files} onChange={setFiles} />
          <ImageUrlPaste value={imageUrlText} onChange={setImageUrlText} />
          <button
            type="button"
            className="comic-btn w-full"
            onClick={() => void autoGenerate()}
            disabled={generating}
          >
            {generating ? "Generating…" : "Auto-Generate Details"}
          </button>
        </div>
        <div className="space-y-4 border-4 border-black bg-white p-5 shadow-[6px_6px_0_0_#000]">
          <label className="block font-comic font-bold">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-comic font-bold">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as LotCategory)}
                className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-comic font-bold">
              Lot #
              <input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                required
                className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              />
            </label>
          </div>
          <label className="block font-comic font-bold">
            Auction
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            >
              <option value="">Unassigned</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.auctionNumber ? `${event.auctionNumber} · ` : ""}
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-comic font-bold">
              Starting bid ($)
              <input
                type="number"
                min={0}
                value={startingBid}
                onChange={(e) => setStartingBid(e.target.value)}
                required
                className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              />
            </label>
            <label className="block font-comic font-bold">
              Reserve price ($)
              <input
                type="number"
                min={0}
                value={reservePrice}
                onChange={(e) => setReservePrice(e.target.value)}
                required
                className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              />
            </label>
          </div>
          <label className="block font-comic font-bold">
            Estimated market value ($)
            <input
              type="number"
              min={0}
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            House commission ({commissionPercent}%)
            <input
              type="range"
              min={10}
              max={30}
              step={1}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              className="mt-2 w-full"
            />
          </label>
          <div className="border-4 border-black bg-[#FFF7D1] p-3 font-comic text-sm">
            <p className="font-display text-lg">Commission breakdown</p>
            <p className="mt-1 flex justify-between gap-4">
              <span>At starting bid</span>
              <span>
                House {formatCurrency(breakdown.start.house)} · Consignor{" "}
                {formatCurrency(breakdown.start.consignor)}
              </span>
            </p>
            <p className="mt-1 flex justify-between gap-4">
              <span>At reserve</span>
              <span>
                House {formatCurrency(breakdown.reserve.house)} · Consignor{" "}
                {formatCurrency(breakdown.reserve.consignor)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="comic-btn-invert" disabled={submitting}>
              {submitting ? "Saving…" : "Save to inventory"}
            </button>
            <button
              type="button"
              className="comic-btn"
              disabled={submitting}
              onClick={() => void submit(true)}
            >
              Post live to site
            </button>
          </div>
          {error && <p className="font-display text-xl text-[#FF0000]">{error}</p>}
        </div>
      </form>
    </section>
  );
}
