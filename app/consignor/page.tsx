"use client";

import { useEffect, useMemo, useState } from "react";
import { DropPhotos, UrlPaste } from "@/components/image-inputs";
import { HOUSE_COMMISSION, money, parseImageUrls, splitCommission, statusLabel } from "@/lib/catalog";
import type { Category, Lot } from "@/lib/types";

const LOCAL_KEY = "dealfinder-consignor-items";

export default function ConsignorPage() {
  const [consignor, setConsignor] = useState("Consignor");
  const [files, setFiles] = useState<File[]>([]);
  const [urlPaste, setUrlPaste] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingBid, setStartingBid] = useState("");
  const [reserve, setReserve] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [category, setCategory] = useState<Category>("Oddities");
  const [items, setItems] = useState<Lot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const rate = HOUSE_COMMISSION;
  const startSplit = splitCommission(Number(startingBid) || 0, rate);
  const reserveSplit = splitCommission(Number(reserve) || 0, rate);
  const marketSplit = splitCommission(Number(estimatedValue) || 0, rate);

  async function load() {
    const res = await fetch(`/api/consignments?consignor=${encodeURIComponent(consignor)}`);
    const json = await res.json();
    if (res.ok) setItems(json.lots ?? []);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCAL_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { consignor?: string };
        if (parsed.consignor) setConsignor(parsed.consignor);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ consignor }));
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consignor]);

  const imageCount = files.length + parseImageUrls(urlPaste).length;

  async function generate() {
    if (!imageCount) {
      setNotice("Add a photo or paste an image URL first.");
      return;
    }
    setGenerating(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: parseImageUrls(urlPaste), titleHint: title, consignor }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI intake failed");
      setTitle(json.title ?? title);
      setDescription(json.description ?? description);
      if (json.startingBid) setStartingBid(String(json.startingBid));
      if (json.reserve) setReserve(String(json.reserve));
      if (json.estimatedValue) setEstimatedValue(String(json.estimatedValue));
      if (json.category) setCategory(json.category);
      setNotice("Details generated. Review, then submit to the approval queue.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "AI intake failed");
    } finally {
      setGenerating(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      let uploaded: string[] = [];
      if (files.length) {
        const body = new FormData();
        for (const file of files.slice(0, 4)) body.append("images", file);
        const up = await fetch("/api/consignment-images", { method: "POST", body });
        const upJson = await up.json();
        if (!up.ok) throw new Error(upJson.error || "Could not upload to consignment-images.");
        uploaded = upJson.urls ?? [];
      }
      const images = [...parseImageUrls(urlPaste), ...uploaded].slice(0, 4);
      const res = await fetch("/api/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consignor,
          title,
          description,
          category,
          startingBid: Number(startingBid) || 0,
          reserve: Number(reserve) || 0,
          estimatedValue: Number(estimatedValue) || 0,
          images,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submit failed");
      setNotice("Submitted for pending approval.");
      setTitle("");
      setDescription("");
      setStartingBid("");
      setReserve("");
      setEstimatedValue("");
      setFiles([]);
      setUrlPaste("");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  const breakdown = useMemo(
    () => [
      { label: "At starting bid", split: startSplit },
      { label: "At reserve", split: reserveSplit },
      { label: "At market value", split: marketSplit },
    ],
    [startSplit, reserveSplit, marketSplit],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
      <div>
        <h1 className="font-display text-6xl">Consignor dashboard</h1>
        <form onSubmit={submit} className="mt-6 space-y-4 comic-panel p-6">
          <label className="block font-comic text-sm font-bold">
            Your name / shop
            <input value={consignor} onChange={(e) => setConsignor(e.target.value)} required className="comic-input" />
          </label>
          <DropPhotos files={files} onChange={setFiles} />
          <UrlPaste value={urlPaste} onChange={setUrlPaste} />
          <button type="button" className="comic-btn-invert" onClick={() => void generate()} disabled={generating}>
            {generating ? "Generating…" : "Auto-Generate Details"}
          </button>
          <label className="block font-comic text-sm font-bold">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className="comic-input" />
          </label>
          <label className="block font-comic text-sm font-bold">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} className="comic-input" />
          </label>
          <label className="block font-comic text-sm font-bold">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="comic-input">
              {["Comics", "Toys", "Vinyl", "Art", "Oddities"].map((row) => (
                <option key={row}>{row}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block font-comic text-sm font-bold">
              Starting bid ($)
              <input type="number" min={0} value={startingBid} onChange={(e) => setStartingBid(e.target.value)} className="comic-input" />
            </label>
            <label className="block font-comic text-sm font-bold">
              Reserve price ($)
              <input type="number" min={0} value={reserve} onChange={(e) => setReserve(e.target.value)} className="comic-input" />
            </label>
            <label className="block font-comic text-sm font-bold">
              Estimated market value ($)
              <input type="number" min={0} value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} className="comic-input" />
            </label>
          </div>
          <p className="font-display text-2xl">House commission ({Math.round(rate * 100)}%)</p>
          <div className="space-y-2">
            <p className="font-display text-xl">Commission breakdown</p>
            {breakdown.map((row) => (
              <p key={row.label} className="font-comic text-sm font-bold">
                {row.label} · House {money(row.split.house)} · You {money(row.split.consignor)}
              </p>
            ))}
          </div>
          {notice && <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">{notice}</p>}
          <button type="submit" className="comic-btn" disabled={busy}>
            {busy ? "Working…" : "Submit for approval"}
          </button>
        </form>
      </div>
      <aside>
        <h2 className="font-display text-4xl">Item status</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-4 border-black bg-white font-comic text-sm font-bold">
            <thead className="bg-black text-white">
              <tr>
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-left">Consignor</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Start / Reserve</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const split = splitCommission(item.startingBid, item.commissionRate);
                return (
                  <tr key={item.id} className="border-t-4 border-black">
                    <td className="p-2">{item.title}</td>
                    <td className="p-2">{item.consignor}</td>
                    <td className="p-2">{statusLabel(item.pipelineStatus || item.status)}</td>
                    <td className="p-2">
                      {money(item.startingBid)} · House {money(split.house)} · You {money(split.consignor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}
