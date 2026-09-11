"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { moneySplit } from "@/lib/commission";
import { collectItemImageUrls } from "@/lib/files";
import { parsePastedImageUrls } from "@/lib/imageUrls";
import {
  DEFAULT_COMMISSION_RATE,
  formatCurrency,
  pipelineLabel,
  type ConsignorItem,
} from "@/lib/utils";

const LOCAL_KEY = "dealfinder-consignor-items";

export default function ConsignorPage() {
  const [consignorName, setConsignorName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrlText, setImageUrlText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ConsignorItem[]>([]);

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

  async function loadItems(name: string) {
    const query = name.trim() ? `?consignor=${encodeURIComponent(name.trim())}` : "";
    const response = await fetch(`/api/consignments${query}`);
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Could not load status table");
      return;
    }
    const remote = (json.items ?? []) as ConsignorItem[];
    const local = readLocal(name);
    const merged = [...local, ...remote].filter(
      (item, index, list) => list.findIndex((row) => row.id === item.id) === index,
    );
    setItems(merged);
  }

  useEffect(() => {
    void loadItems("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoGenerate() {
    setError(null);
    setNotice(null);
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
      if (!response.ok) {
        throw new Error(json.error || "AI intake failed");
      }
      setTitle(String(json.title ?? ""));
      setDescription(String(json.description ?? ""));
      if (json.suggested_starting_bid) {
        setStartingBid(String(json.suggested_starting_bid));
      }
      if (json.estimated_market_value) {
        setMarketValue(String(json.estimated_market_value));
        if (!reservePrice) {
          setReservePrice(String(json.estimated_market_value));
        }
      }
      setNotice("Details generated. Review, then submit to the approval queue.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI intake failed");
    } finally {
      setGenerating(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const imageUrls = await collectItemImageUrls(files, imageUrlText);
      const response = await fetch("/api/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consignorName,
          title,
          description,
          startingBid: start,
          reservePrice: reserve,
          commissionRate,
          estimatedMarketValue: market,
          imageUrls,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Submit failed");
      }
      const item = json.item as ConsignorItem;
      writeLocal(item);
      setItems((current) => [item, ...current.filter((row) => row.id !== item.id)]);
      setNotice("Submitted for pending approval.");
      setTitle("");
      setDescription("");
      setStartingBid("");
      setReservePrice("");
      setMarketValue("");
      setFiles([]);
      setImageUrlText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-5xl">Consignor dashboard</h1>
        <p className="mt-2 max-w-2xl font-comic text-lg">
          Drop photos, auto-generate catalog copy with GPT-4o, set reserve and starting
          bid, then track pending / live / sold lots.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
        <div className="comic-panel space-y-4 bg-white p-6">
          <label className="block font-comic font-bold">
            Your name / shop
            <input
              value={consignorName}
              onChange={(e) => setConsignorName(e.target.value)}
              onBlur={() => void loadItems(consignorName)}
              required
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              placeholder="Vault Comics Co."
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

        <div className="comic-panel space-y-4 bg-white p-6">
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
              rows={5}
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            />
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

          <div className="border-4 border-black bg-brand-cream p-3 font-comic text-sm">
            <p className="font-display text-lg">Commission breakdown</p>
            <Row label="At starting bid" split={breakdown.start} />
            <Row label="At reserve" split={breakdown.reserve} />
            <Row label="At market value" split={breakdown.market} />
          </div>

          <button type="submit" className="comic-btn w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </form>

      {error && (
        <p className="comic-panel bg-brand-red p-4 font-display text-2xl text-white">{error}</p>
      )}
      {notice && (
        <p className="comic-panel bg-white p-4 font-display text-2xl">{notice}</p>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-3xl">Item status</h2>
        <div className="overflow-x-auto comic-panel">
          <table className="w-full min-w-[720px] border-collapse font-comic">
            <thead className="bg-brand-red text-left text-white">
              <tr>
                <th className="border-b-4 border-black p-3">Lot</th>
                <th className="border-b-4 border-black p-3">Consignor</th>
                <th className="border-b-4 border-black p-3">Status</th>
                <th className="border-b-4 border-black p-3">Start / Reserve</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="bg-white">
                  <td className="border-b-2 border-black p-3">{item.title}</td>
                  <td className="border-b-2 border-black p-3">{item.consignor}</td>
                  <td className="border-b-2 border-black p-3 font-bold uppercase">
                    {pipelineLabel(item.pipelineStatus)}
                  </td>
                  <td className="border-b-2 border-black p-3">
                    {formatCurrency(item.startingBid)} / {formatCurrency(item.reservePrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  split,
}: {
  label: string;
  split: { house: number; consignor: number };
}) {
  return (
    <p className="mt-1 flex justify-between gap-4">
      <span>{label}</span>
      <span>
        House {formatCurrency(split.house)} · You {formatCurrency(split.consignor)}
      </span>
    </p>
  );
}

function readLocal(name: string): ConsignorItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as ConsignorItem[]) : [];
    if (!name.trim()) return list;
    return list.filter((item) =>
      item.consignor.toLowerCase().includes(name.trim().toLowerCase()),
    );
  } catch {
    return [];
  }
}

function writeLocal(item: ConsignorItem) {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as ConsignorItem[]) : [];
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify([item, ...list]));
  } catch {
    /* ignore quota */
  }
}
