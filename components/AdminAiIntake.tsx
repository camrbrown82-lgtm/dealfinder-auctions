"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { HOUSE_CONSIGNOR } from "@/lib/consignors";
import { collectItemImageUrls } from "@/lib/files";
import { requestStudioImage } from "@/lib/studioClient";
import { requestCatalog, heroPhotoForStudio } from "@/lib/aiIntakeClient";
import { mergeAiRuns, type AiRun } from "@/lib/aiRuns";
import { AiFeedback } from "@/components/AiFeedback";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { ItemDetailsField, ListingConditionField } from "@/components/ListingGradeFields";
import { type ListingGrade } from "@/lib/listingGrade";
import { listingImages, parsePastedImageUrls } from "@/lib/imageUrls";
import type { SlothPhotoPhase } from "@/lib/turboSloth";

export function AdminAiIntake({
  suggestedLotNumber,
  defaultStartingBid,
  defaultEventId,
  onPosted,
  workspace = false,
}: {
  suggestedLotNumber: string;
  defaultStartingBid: number;
  defaultEventId?: string;
  workspace?: boolean;
  onPosted: (message: string, lot?: { id: string; title: string; lotNumber?: string | null }) => Promise<void> | void;
}) {
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
  const [lotNumber, setLotNumber] = useState(suggestedLotNumber);
  const [error, setError] = useState<string | null>(null);
  const [photoPhase, setPhotoPhase] = useState<SlothPhotoPhase | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const generating = photoPhase !== null;
  const generateLock = useRef(false);
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
    setHeroIndex(0);
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
  const start = Number(startingBid) || 0;
  const reserve = Number(reservePrice) || 0;

  async function autoGenerate(fromFiles?: File[]) {
    if (generateLock.current) return;
    setError(null);
    const photos = fromFiles ?? files;
    if (photos.length === 0 && parsePastedImageUrls(imageUrlText).length === 0) {
      setError("Add a photo or paste an image URL first.");
      return;
    }
    generateLock.current = true;
    setStudioImageUrl(null);
    setHeroIndex(0);
    setPhotoPhase("reviewing");
    try {
      const catalog = await requestCatalog(photos, imageUrlText, {
        itemDetails,
        listingGrade,
      });
      setResolvedImageUrls(catalog.imageUrls);
      setHeroIndex(catalog.hero_index ?? 0);
      setTitle(String(catalog.title ?? ""));
      setDescription(String(catalog.description ?? ""));
      if (catalog.estimated_market_value) {
        setMarketValue(String(catalog.estimated_market_value));
      }
      setCompsNote(catalog.comps_note ? String(catalog.comps_note) : null);
      let run = catalog.ai ?? null;
      try {
        const hero = heroPhotoForStudio(catalog, photos);
        const studio = await requestStudioImage(
          {
            imageUrls: hero.imageUrls,
            files: hero.files,
            title: String(catalog.title ?? ""),
            objectType: String(catalog.object_type ?? ""),
            materials: Array.isArray(catalog.materials) ? catalog.materials.map(String) : [],
            condition: String(catalog.condition ?? ""),
            itemDetails,
            listingGrade,
            displaySetting: String(catalog.display_setting ?? ""),
            photoBrief: String(catalog.photo_brief ?? ""),
          },
          setPhotoPhase,
        );
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
      generateLock.current = false;
      setPhotoPhase(null);
    }
  }

  async function submit(postLive: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      if (!title.trim() || !description.trim()) {
        throw new Error("Generate or fill title and description before posting.");
      }
      // A Buy Now price is all it takes: the lot goes into the sale and the store.
      const saleChannel = reserve > 0 ? "buy_now" : "auction";
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
          consignorName: HOUSE_CONSIGNOR,
          title,
          description,
          listingGrade,
          itemDetails,
          startingBid: start > 0 ? start : defaultStartingBid,
          buyNowPrice: reserve,
          reservePrice: reserve,
          estimatedMarketValue: Number(marketValue) || 0,
          commissionRate: 0,
          imageUrls,
          lotNumber,
          postLive,
          saleChannel,
          eventId: defaultEventId || undefined,
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
      setHeroIndex(0);
      setCompsNote(null);
      setAiRun(null);
      setItemDetails("");
      setListingGrade("Used");
      const sale = json.auctionLabel ?? "the next weekly sale";
      const store = reserve > 0 ? " and into Buy Now" : "";
      await onPosted(
        postLive
          ? `Posted ${lotNumber} live onto ${sale}${store}.`
          : `Saved ${lotNumber} onto ${sale}${store}.`,
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
      {!workspace && <h2 className="font-display text-3xl">Warehouse AI generator</h2>}
      <p className="font-comic text-sm">
        House-owned stock only. Upload up to 4 warehouse photos, generate catalog copy and a studio
        listing shot, then save. These lots are already paid for by the house, so there is no
        consignor commission.
      </p>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div className="comic-panel flex h-full flex-col space-y-4 p-5">
          {workspace && (
            <div className="comic-photo-stage min-h-[22rem]">
              {workingImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={workingImage}
                  alt="Listing photo"
                  className="absolute inset-0 h-full w-full bg-white object-contain"
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
          <p className="border-4 border-black bg-[#FFF7D1] p-3 font-comic text-sm">
            Owner: {HOUSE_CONSIGNOR}. Hammer proceeds stay with the house.
          </p>
          {/* Photos wait here. Cataloging only starts on Auto-Generate Details. */}
          <PhotoDropzone files={files} onChange={setFiles} maxFiles={4} />
          <ImageUrlPaste value={imageUrlText} onChange={setImageUrlText} />
          <ItemDetailsField details={itemDetails} onDetails={setItemDetails} />
        </div>
        <div className="comic-panel flex h-full flex-col space-y-4 p-5">
          <label className="block font-comic font-bold">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Description
            <GrowingTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={2}
              maxRows={8}
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-comic font-bold">
              Lot #
              <input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                required
                className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              />
            </label>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <label className="block font-comic font-bold">
              Starting bid ($)
              <input
                type="number"
                min={0}
                step="1"
                value={startingBid}
                onChange={(e) => {
                  setStartingTouched(true);
                  setStartingBid(e.target.value);
                }}
                required
                className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              />
              <span className="mt-1 block font-normal">
                New lots open at ${defaultStartingBid}. Type a lower price to open this lot there. The next lot goes back to ${defaultStartingBid}.
              </span>
            </label>
            <label className="block font-comic font-bold">
              Buy now ($)
              <input
                type="number"
                min={0}
                value={reservePrice}
                onChange={(e) => setReservePrice(e.target.value)}
                className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              />
              <span className="mt-1 block font-normal">
                {reserve > 0
                  ? "This price lists the lot on Buy Now in every auction it sits in, and it stays in the live sale."
                  : "Empty means this lot never reaches Buy Now. Fill it to list it in the store as well."}
              </span>
            </label>
          </div>
          <label className="block font-comic font-bold">
            Estimated market value ($)
            <input
              type="number"
              min={0}
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Price comp
            <GrowingTextarea
              value={compsNote ?? ""}
              onChange={(e) => setCompsNote(e.target.value)}
              rows={2}
              maxRows={8}
              placeholder="Auto-Generate lists matching sold prices, then current asking prices."
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          {aiRun && !generating ? (
            <AiFeedback
              staff
              run={aiRun}
              summary={[title, description, compsNote].filter(Boolean).join(" · ")}
            />
          ) : null}
        </div>
        </div>
        <div className="comic-panel space-y-4 p-5">
          <ListingConditionField grade={listingGrade} onGrade={setListingGrade} />
          <div className="flex flex-row flex-wrap items-end gap-3">
            <button
              type="button"
              className="comic-btn w-full sm:flex-1"
              onClick={() => void autoGenerate()}
              disabled={generating}
            >
              {generating ? "Cataloging + studio photo…" : "Auto-Generate Details"}
            </button>
            <button type="submit" className="comic-btn-invert w-full sm:flex-1" disabled={submitting}>
              {submitting ? "Saving…" : "Save to inventory"}
            </button>
            <button
              type="button"
              className="comic-btn w-full sm:flex-1"
              disabled={submitting}
              onClick={() => void submit(true)}
            >
              {reserve > 0 ? "Post live + Buy Now" : "Post live to site"}
            </button>
          </div>
          {error && <p className="font-display text-xl text-[#FF0000]">{error}</p>}
        </div>
      </form>
    </section>
  );
}
