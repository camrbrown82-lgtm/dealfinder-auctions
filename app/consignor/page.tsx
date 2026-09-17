"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { moneySplit } from "@/lib/commission";
import { ConsignmentTermsModal } from "@/components/ConsignmentTermsModal";
import { AiFeedback } from "@/components/AiFeedback";
import { ConsignorNameField } from "@/components/ConsignorNameField";
import { collectItemImageUrls } from "@/lib/files";
import { listingImages, parsePastedImageUrls } from "@/lib/imageUrls";
import { generateListingFromPhotos } from "@/lib/generateListing";
import { parseApiJson } from "@/lib/apiJson";
import { type AiRun } from "@/lib/aiRuns";
import { ListingGradeFields } from "@/components/ListingGradeFields";
import { type ListingGrade } from "@/lib/listingGrade";
import {
  DEFAULT_COMMISSION_RATE,
  formatCurrency,
  pipelineLabel,
  type ConsignorItem,
} from "@/lib/utils";

const LOCAL_KEY = "dealfinder-consignor-items";

export default function ConsignorPage() {
  const [consignorName, setConsignorName] = useState("");
  const [savedConsignors, setSavedConsignors] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrlText, setImageUrlText] = useState("");
  const [resolvedImageUrls, setResolvedImageUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ConsignorItem[]>([]);
  const [compsNote, setCompsNote] = useState<string | null>(null);
  const [studioImageUrl, setStudioImageUrl] = useState<string | null>(null);
  const [aiRun, setAiRun] = useState<AiRun | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [itemDetails, setItemDetails] = useState("");
  const [listingGrade, setListingGrade] = useState<ListingGrade>("Used");

  const commissionRate = Number(commissionPercent) / 100 || DEFAULT_COMMISSION_RATE;
  const buyNow = Number(buyNowPrice) || 0;
  const market = Number(marketValue) || 0;

  const breakdown = useMemo(
    () => ({
      buyNow: moneySplit(buyNow, commissionRate),
      market: moneySplit(market, commissionRate),
    }),
    [buyNow, market, commissionRate],
  );

  async function loadItems(name: string) {
    const local = readLocal(name);
    if (!name.trim()) {
      setItems(local);
      return;
    }
    const query = `?consignor=${encodeURIComponent(name.trim())}`;
    const response = await fetch(`/api/consignments${query}`);
    const json = await parseApiJson<{ items?: ConsignorItem[]; error?: string }>(response);
    if (!response.ok) {
      setError(json.error || "Could not load status table");
      setItems(local);
      return;
    }
    const remote = (json.items ?? []) as ConsignorItem[];
    const merged = [...local, ...remote].filter(
      (item, index, list) => list.findIndex((row) => row.id === item.id) === index,
    );
    setItems(merged);
  }

  useEffect(() => {
    setItems(readLocal(""));
    void fetch("/api/consignors")
      .then((response) => parseApiJson<{ consignors?: string[] }>(response))
      .then((json) => {
        if (Array.isArray(json.consignors)) setSavedConsignors(json.consignors);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItems(consignorName);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consignorName]);

  useEffect(() => {
    setResolvedImageUrls([]);
    setStudioImageUrl(null);
    setAiRun(null);
  }, [files, imageUrlText]);

  async function autoGenerate(fromFiles?: File[]) {
    setError(null);
    setNotice(null);
    const photos = fromFiles ?? files;
    if (photos.length === 0 && parsePastedImageUrls(imageUrlText).length === 0) {
      setError("Add a photo or paste an image URL first.");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateListingFromPhotos(photos, imageUrlText, { itemDetails, listingGrade }, {
        onCatalog(catalog) {
          setResolvedImageUrls(catalog.imageUrls);
          setTitle(String(catalog.title ?? ""));
          setDescription(String(catalog.description ?? ""));
          if (catalog.estimated_market_value) {
            setMarketValue(String(catalog.estimated_market_value));
          }
          setCompsNote(catalog.comps_note ? String(catalog.comps_note) : null);
          setNotice("Catalog ready. Listing photo is still rendering…");
        },
        onStudio() {
          setNotice("Listing photo ready. Review, then submit.");
        },
      });
      setResolvedImageUrls(result.imageUrls);
      setAiRun(result.run);
      if (result.studioUrl) setStudioImageUrl(result.studioUrl);
      if (result.studioError) {
        setStudioImageUrl(null);
        setError(result.studioError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI intake failed");
    } finally {
      setGenerating(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setTermsOpen(true);
  }

  async function submitAfterAccept() {
    setError(null);
    setSubmitting(true);
    try {
      const warehouse = await collectItemImageUrls(files, imageUrlText);
      const imageUrls = listingImages(studioImageUrl, warehouse);
      const response = await fetch("/api/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consignorName,
          title,
          description,
          buyNowPrice: buyNow,
          commissionRate,
          estimatedMarketValue: market,
          listingGrade,
          itemDetails,
          imageUrls,
          termsAccepted: true,
        }),
      });
      const json = await parseApiJson<{ item?: ConsignorItem; error?: string }>(response);
      if (!response.ok) {
        throw new Error(json.error || "Submit failed");
      }
      const item = json.item as ConsignorItem;
      writeLocal(item);
      setItems((current) => [item, ...current.filter((row) => row.id !== item.id)]);
      setTermsOpen(false);
      setNotice("Submitted for pending approval. DealFinder will assign lot # and sale date.");
      setTitle("");
      setDescription("");
      setBuyNowPrice("");
      setMarketValue("");
      setFiles([]);
      setImageUrlText("");
      setCompsNote(null);
      setStudioImageUrl(null);
      setAiRun(null);
      setItemDetails("");
      setListingGrade("Used");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-5xl text-brand-red">Consignor dashboard</h1>
        <p className="mt-2 max-w-2xl font-comic text-lg">
          Drop up to 4 warehouse photos, auto-generate catalog copy, and we build a studio
          listing photo for the live sale. After we approve the item, DealFinder assigns the
          lot number and sale date.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
        <div className="comic-panel space-y-4 p-6">
          <ConsignorNameField
            value={consignorName}
            savedNames={savedConsignors}
            onChange={setConsignorName}
          />
          {studioImageUrl && (
            <div className="relative min-h-[16rem] overflow-hidden border-4 border-black bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={studioImageUrl}
                alt="AI listing photo"
                className="absolute inset-0 h-full w-full object-contain"
              />
              <p className="absolute bottom-2 left-2 border-4 border-black bg-white px-2 py-1 font-comic text-xs">
                AI listing photo
              </p>
            </div>
          )}
          <PhotoDropzone
            files={files}
            onChange={setFiles}
            maxFiles={4}
            onCameraFinished={(photos) => {
              if (photos.length > 0) void autoGenerate(photos);
            }}
          />
          <ImageUrlPaste value={imageUrlText} onChange={setImageUrlText} />
          <ListingGradeFields
            details={itemDetails}
            grade={listingGrade}
            onDetails={setItemDetails}
            onGrade={setListingGrade}
          />
          <button
            type="button"
            className="comic-btn w-full"
            onClick={() => void autoGenerate()}
            disabled={generating}
          >
            {generating ? "Cataloging + studio photo…" : "Auto-Generate Details"}
          </button>
        </div>

        <div className="comic-panel space-y-4 p-6">
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
          <label className="block font-comic font-bold">
            Buy now ($)
            <span className="block font-normal">You set this — Auto-Generate does not fill buy now.</span>
            <input
              type="number"
              min={1}
              value={buyNowPrice}
              onChange={(e) => setBuyNowPrice(e.target.value)}
              required
              className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
            />
          </label>
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
          {compsNote && (
            <p className="border-4 border-black bg-brand-cream p-3 font-comic text-sm">{compsNote}</p>
          )}
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
            <Row label="At buy now" split={breakdown.buyNow} />
            <Row label="At market value" split={breakdown.market} />
          </div>

          {aiRun && !generating ? (
            <AiFeedback
              run={aiRun}
              summary={[title, description, compsNote].filter(Boolean).join(" · ")}
            />
          ) : null}

          <button type="submit" className="comic-btn w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </form>

      {error && !termsOpen && (
        <p className="comic-panel bg-brand-red p-4 font-display text-2xl text-white">{error}</p>
      )}
      {notice && (
        <p className="comic-panel p-4 font-display text-2xl">{notice}</p>
      )}

      <ConsignmentTermsModal
        open={termsOpen}
        consignorName={consignorName}
        busy={submitting}
        error={error}
        onClose={() => {
          if (submitting) return;
          setTermsOpen(false);
          setError(null);
        }}
        onAccept={() => void submitAfterAccept()}
      />

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Waiting on DealFinder</h2>
        <p className="font-comic text-sm">
          Only items still in the approval queue. Once we accept a lot it leaves this list
          and moves into that week&apos;s auction inventory.
        </p>
        <StatusTable
          items={items.filter((item) => item.pipelineStatus === "pending_approval")}
          empty="Nothing waiting on approval."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Accepted lots</h2>
        <p className="font-comic text-sm">
          Filed into a sale by DealFinder. Check here for scheduled, live, or sold status.
        </p>
        <StatusTable
          items={items.filter((item) => item.pipelineStatus !== "pending_approval")}
          empty="No accepted lots yet."
        />
      </section>
    </div>
  );
}

function StatusTable({ items, empty }: { items: ConsignorItem[]; empty: string }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <p className="comic-panel p-3 font-comic">{empty}</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="comic-panel space-y-1 p-3 font-comic">
              <p className="font-display text-lg leading-5">{item.title}</p>
              <p>{item.consignor}</p>
              <p className="font-bold uppercase">{pipelineLabel(item.pipelineStatus)}</p>
              <p>Buy now {formatCurrency(item.buyNowPrice || 0)}</p>
            </article>
          ))
        )}
      </div>
      <div className="hidden md:block comic-panel">
        <table className="w-full border-collapse font-comic">
          <thead className="bg-brand-red text-left text-white">
            <tr>
              <th className="border-b-4 border-black p-3">Lot</th>
              <th className="border-b-4 border-black p-3">Consignor</th>
              <th className="border-b-4 border-black p-3">Status</th>
              <th className="border-b-4 border-black p-3">Buy now</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="bg-brand-cream">
                <td className="p-3" colSpan={4}>
                  {empty}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="bg-brand-cream">
                  <td className="border-b-2 border-black p-3">{item.title}</td>
                  <td className="border-b-2 border-black p-3">{item.consignor}</td>
                  <td className="border-b-2 border-black p-3 font-bold uppercase">
                    {pipelineLabel(item.pipelineStatus)}
                  </td>
                  <td className="border-b-2 border-black p-3">
                    {formatCurrency(item.buyNowPrice || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
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
