"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { moneySplit } from "@/lib/commission";
import { OwnerPicker } from "@/components/OwnerPicker";
import { HOUSE_CONSIGNOR } from "@/lib/consignors";
import { collectItemImageUrls } from "@/lib/files";
import { requestStudioImage } from "@/lib/studioClient";
import { requestCatalog } from "@/lib/aiIntakeClient";
import { mergeAiRuns, type AiRun } from "@/lib/aiRuns";
import { AiFeedback } from "@/components/AiFeedback";
import { ListingGradeFields } from "@/components/ListingGradeFields";
import { type ListingGrade } from "@/lib/listingGrade";
import { listingImages, parsePastedImageUrls } from "@/lib/imageUrls";
import {
  DEFAULT_COMMISSION_RATE,
  formatCurrency,
} from "@/lib/utils";

export function AdminAiIntake({
  suggestedLotNumber,
  defaultStartingBid,
  consignors,
  onPosted,
  workspace = false,
}: {
  suggestedLotNumber: string;
  defaultStartingBid: number;
  consignors: string[];
  workspace?: boolean;
  onPosted: (message: string, lot?: { id: string; title: string; lotNumber?: string | null }) => Promise<void> | void;
}) {
  const [consignorName, setConsignorName] = useState(HOUSE_CONSIGNOR);
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrlText, setImageUrlText] = useState("");
  const [resolvedImageUrls, setResolvedImageUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemDetails, setItemDetails] = useState("");
  const [listingGrade, setListingGrade] = useState<ListingGrade>("Used");
  const [startingBid, setStartingBid] = useState(String(defaultStartingBid));
  const [startingTouched, setStartingTouched] = useState(false);
  const [reservePrice, setReservePrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [lotNumber, setLotNumber] = useState(suggestedLotNumber);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [compsNote, setCompsNote] = useState<string | null>(null);
  const [studioImageUrl, setStudioImageUrl] = useState<string | null>(null);
  const [aiRun, setAiRun] = useState<AiRun | null>(null);

  useEffect(() => {
    setLotNumber(suggestedLotNumber);
  }, [suggestedLotNumber]);

  useEffect(() => {
    if (!startingTouched) setStartingBid(String(defaultStartingBid));
  }, [defaultStartingBid, startingTouched]);

  useEffect(() => {
    setResolvedImageUrls([]);
    setStudioImageUrl(null);
    setAiRun(null);
  }, [files, imageUrlText]);
  useEffect(() => {
    const file = files[0];
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  const workingImage = studioImageUrl || resolvedImageUrls[0] || filePreview;

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

  async function autoGenerate(fromFiles?: File[]) {
    setError(null);
    const photos = fromFiles ?? files;
    if (photos.length === 0 && parsePastedImageUrls(imageUrlText).length === 0) {
      setError("Add a photo or paste an image URL first.");
      return;
    }
    setGenerating(true);
    try {
      const catalog = await requestCatalog(photos, imageUrlText, {
        itemDetails,
        listingGrade,
      });
      setResolvedImageUrls(catalog.imageUrls);
      setTitle(String(catalog.title ?? ""));
      setDescription(String(catalog.description ?? ""));
      if (catalog.estimated_market_value) setMarketValue(String(catalog.estimated_market_value));
      setCompsNote(catalog.comps_note ? String(catalog.comps_note) : null);
      let run = catalog.ai ?? null;
      try {
        const studio = await requestStudioImage({
          imageUrls: catalog.imageUrls,
          files: photos,
          title: String(catalog.title ?? ""),
          objectType: String(catalog.object_type ?? ""),
          materials: Array.isArray(catalog.materials) ? catalog.materials.map(String) : [],
          condition: String(catalog.condition ?? ""),
          itemDetails,
          listingGrade,
          displaySetting: String(catalog.display_setting ?? ""),
          photoBrief: String(catalog.photo_brief ?? ""),
        });
        setStudioImageUrl(studio.url);
        run = mergeAiRuns(run, studio.ai);
      } catch (studioErr) {
        setStudioImageUrl(null);
        setError(studioErr instanceof Error ? studioErr.message : "Listing photo failed.");
      }
      setAiRun(run);
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
      if (!title.trim() || !description.trim()) {
        throw new Error("Generate or fill title and description before posting.");
      }
      const warehouse =
        resolvedImageUrls.length > 0
          ? resolvedImageUrls
          : await collectItemImageUrls(files, imageUrlText, { fallbackDataUrl: true });
      const imageUrls = listingImages(studioImageUrl, warehouse);
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createLot",
          consignorName,
          title,
          description,
          listingGrade,
          itemDetails,
          startingBid: start || defaultStartingBid,
          buyNowPrice: reserve,
          reservePrice: reserve,
          commissionRate,
          imageUrls,
          lotNumber,
          postLive,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not save lot.");
      setTitle("");
      setDescription("");
      setStartingBid(String(defaultStartingBid));
      setStartingTouched(false);
      setReservePrice("");
      setMarketValue("");
      setFiles([]);
      setImageUrlText("");
      setResolvedImageUrls([]);
      setStudioImageUrl(null);
      setCompsNote(null);
      setAiRun(null);
      setItemDetails("");
      setListingGrade("Used");
      await onPosted(
        postLive
          ? `Posted ${lotNumber} live onto ${json.auctionLabel ?? "the next weekly sale"}.`
          : `Saved ${lotNumber} onto ${json.auctionLabel ?? "the next weekly sale"}.`,
        json.lot,
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
      {!workspace && <h2 className="font-display text-3xl">Post inventory with AI</h2>}
      <p className="font-comic text-sm">
        {workspace
          ? "Upload up to 4 warehouse photos. Generate makes a studio listing shot for live and inventory, then the form clears when you save."
          : "Upload up to 4 warehouse photos. Generate catalogs them, looks up comps, and builds a studio listing photo."}
      </p>
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
        <div className="comic-panel space-y-4 p-5">
          {workspace && (
            <div className="relative min-h-[22rem] overflow-hidden border-4 border-black bg-[#FFF7D1]">
              {workingImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={workingImage}
                  alt="Listing photo"
                  className="absolute inset-0 h-full w-full object-contain bg-black"
                />
              ) : (
                <p className="flex h-full min-h-[22rem] items-center justify-center p-6 text-center font-display text-2xl">
                  Drop warehouse photos, then generate
                </p>
              )}
              {workingImage && (
                <p className="absolute bottom-2 left-2 border-4 border-black bg-white px-2 py-1 font-comic text-xs">
                  {studioImageUrl ? "AI listing photo" : "Warehouse photo"}
                </p>
              )}
            </div>
          )}
          <OwnerPicker
            value={consignorName ?? ""}
            consignors={consignors}
            onChange={setConsignorName}
          />
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
        <div className="comic-panel space-y-4 p-5">
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
              Lot #
              <input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                required
                className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-comic font-bold">
              Starting bid ($)
              <input
                type="number"
                min={0}
                value={startingBid}
                onChange={(e) => {
                  setStartingTouched(true);
                  setStartingBid(e.target.value);
                }}
                required
                className="mt-2 w-full border-4 border-black px-3 py-2 font-normal"
              />
            </label>
            <label className="block font-comic font-bold">
              Buy now ($)
              <span className="block font-normal">You set this — Auto-Generate does not fill buy now.</span>
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
          {compsNote && (
            <p className="border-4 border-black bg-[#FFF7D1] p-3 font-comic text-sm">{compsNote}</p>
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
              <span>At buy now</span>
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
          {aiRun && !generating ? (
            <AiFeedback
              staff
              run={aiRun}
              summary={[title, description, compsNote].filter(Boolean).join(" · ")}
            />
          ) : null}
        </div>
      </form>
    </section>
  );
}
