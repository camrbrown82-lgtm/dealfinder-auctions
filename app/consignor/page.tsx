"use client";

import { FormEvent, useEffect, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { houseCommissionPercent } from "@/lib/commission";
import { ConsignmentTermsModal } from "@/components/ConsignmentTermsModal";
import { AiFeedback } from "@/components/AiFeedback";
import { ConsignorNameField } from "@/components/ConsignorNameField";
import { useBidder } from "@/components/BidderProvider";
import { collectItemImageUrls } from "@/lib/files";
import { listingImages, parsePastedImageUrls } from "@/lib/imageUrls";
import { requestCatalog } from "@/lib/aiIntakeClient";
import { parseApiJson } from "@/lib/apiJson";
import { requestStudioImage } from "@/lib/studioClient";
import { mergeAiRuns, type AiRun } from "@/lib/aiRuns";
import { ListingGradeFields } from "@/components/ListingGradeFields";
import { type ListingGrade } from "@/lib/listingGrade";
import {
  DEFAULT_COMMISSION_RATE,
  formatCurrency,
  pipelineLabel,
  type ConsignorItem,
} from "@/lib/utils";

const LOCAL_KEY = "dealfinder-consignor-items";
const BATCH_KEY = "dealfinder-consignment-batch";
const BATCH_FLAG_KEY = "dealfinder-consignment-batch-on";

export default function ConsignorPage() {
  const { user, ready, requestAuth } = useBidder();
  const [consignorName, setConsignorName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrlText, setImageUrlText] = useState("");
  const [resolvedImageUrls, setResolvedImageUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ConsignorItem[]>([]);
  const [compsNote, setCompsNote] = useState<string | null>(null);
  const [studioImageUrl, setStudioImageUrl] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [aiRun, setAiRun] = useState<AiRun | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [itemDetails, setItemDetails] = useState("");
  const [listingGrade, setListingGrade] = useState<ListingGrade>("Used");
  const [requestBuyNow, setRequestBuyNow] = useState(false);
  const [multipleItems, setMultipleItems] = useState(false);
  const [batchItems, setBatchItems] = useState<ConsignorItem[]>([]);
  const [emailingBatch, setEmailingBatch] = useState(false);

  const buyNow = Number(buyNowPrice) || 0;
  const housePercent = houseCommissionPercent(DEFAULT_COMMISSION_RATE);

  async function loadItems() {
    const local = readLocal(consignorName || user?.fullName || "");
    const response = await fetch("/api/consignments", { credentials: "include" });
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
    setMultipleItems(readBatchFlag());
    setBatchItems(readBatch());
  }, []);

  useEffect(() => {
    writeBatchFlag(multipleItems);
    writeBatch(batchItems);
  }, [multipleItems, batchItems]);

  useEffect(() => {
    if (user?.fullName) setConsignorName(user.fullName);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      const catalog = await requestCatalog(photos, imageUrlText, {
        itemDetails,
        listingGrade,
      });
      setResolvedImageUrls(catalog.imageUrls);
      setTitle(String(catalog.title ?? ""));
      setDescription(String(catalog.description ?? ""));
      if (catalog.estimated_market_value) {
        setMarketValue(String(catalog.estimated_market_value));
      }
      setCompsNote(catalog.comps_note ? String(catalog.comps_note) : null);
      let run = catalog.ai ?? null;
      setNotice("Catalog ready. Creating the AI listing photo…");
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
        setNotice("Listing photo ready. Review, then submit.");
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consignorName,
          title,
          description,
          buyNowPrice: buyNow,
          estimatedMarketValue: Number(marketValue) || 0,
          listingGrade,
          itemDetails,
          imageUrls,
          termsAccepted: true,
          saleChannel: requestBuyNow ? "buy_now" : "auction",
          requestBuyNow,
          sendConfirmation: !multipleItems,
          batchItems: !multipleItems
            ? batchItems.map((row) => ({
                title: row.title,
                startingBid: row.startingBid,
                buyNowPrice: row.buyNowPrice,
              }))
            : undefined,
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
      if (multipleItems) {
        setBatchItems((current) => [item, ...current.filter((row) => row.id !== item.id)]);
        setNotice(
          "Saved to this consignment list. Add another item, or click I’m done adding items — email my list.",
        );
      } else if (batchItems.length) {
        setBatchItems([]);
        setNotice(
          "Submitted. Combined confirmation emailed for every item in this list, including this one.",
        );
      } else {
        setNotice(
          requestBuyNow
            ? "Submitted as Buy Now, pending admin approval. A confirmation email is on the way."
            : "Submitted for pending approval. A confirmation email is on the way. DealFinder will assign lot # and sale date.",
        );
      }
      setRequestBuyNow(false);
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

  async function emailMyList() {
    if (batchItems.length === 0) return;
    setError(null);
    setEmailingBatch(true);
    try {
      const response = await fetch("/api/consignments/confirmation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: batchItems.map((row) => ({
            id: row.id,
            title: row.title,
            startingBid: row.startingBid,
            buyNowPrice: row.buyNowPrice,
          })),
        }),
      });
      const json = await parseApiJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(json.error || "Could not send confirmation email");
      }
      setBatchItems([]);
      setMultipleItems(false);
      setNotice("Combined confirmation emailed for every item in this list.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send confirmation email");
    } finally {
      setEmailingBatch(false);
    }
  }

  if (!ready) {
    return <div className="comic-panel p-6 font-comic">Checking your account…</div>;
  }

  if (!user) {
    return (
      <div className="comic-panel max-w-xl space-y-4 p-6">
        <h1 className="font-display text-4xl text-brand-red">Log in to consign</h1>
        <p className="font-comic text-lg">
          Use your DealFinder account so we can attach items to you. Other consignors&apos; names
          are never shown on this form.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="comic-btn" onClick={() => requestAuth(undefined, "login")}>
            Log in
          </button>
          <button type="button" className="comic-btn-invert" onClick={() => requestAuth(undefined, "signup")}>
            Create account
          </button>
        </div>
      </div>
    );
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
          <ConsignorNameField value={consignorName} />
          <div className="comic-photo-stage min-h-[16rem]">
            {studioImageUrl || resolvedImageUrls[0] || filePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studioImageUrl || resolvedImageUrls[0] || filePreview || ""}
                alt="AI listing photo"
                className="absolute inset-0 h-full w-full bg-white object-contain"
              />
            ) : (
              <p className="flex h-full min-h-[16rem] items-center justify-center p-6 text-center font-display text-2xl">
                Drop photos, then generate
              </p>
            )}
            {(studioImageUrl || resolvedImageUrls[0] || filePreview) && (
              <p className="absolute bottom-2 left-2 border-4 border-black bg-white px-2 py-1 font-comic text-xs">
                {studioImageUrl ? "AI listing photo" : "Uploaded photo"}
              </p>
            )}
          </div>
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
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={5}
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
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
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
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
          {compsNote && (
            <p className="border-4 border-black bg-brand-cream p-3 font-comic text-sm">{compsNote}</p>
          )}
          <div className="border-4 border-black bg-brand-cream p-3 font-comic text-sm">
            <p className="font-display text-lg">House commission ({housePercent}%)</p>
            <p>
              The agreed house rate is in the consignor agreement you accept on submit — typically{" "}
              {housePercent}% of the hammer. You cannot pick a custom percent here. Final commission
              is based on the sale price.
            </p>
          </div>

          <label className="flex items-start gap-2 font-comic text-sm font-bold">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={requestBuyNow}
              onChange={(e) => setRequestBuyNow(e.target.checked)}
            />
            <span>
              Set as Buy Now, pending admin approval
              <span className="block font-normal">
                Staff must approve before this item appears on the public Buy Now page.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 font-comic text-sm font-bold">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={multipleItems}
              onChange={(e) => setMultipleItems(e.target.checked)}
            />
            <span>
              I have multiple items to consign
              <span className="block font-normal">
                Leave this checked while you add more items. We hold the confirmation email and send
                one list when you finish.
              </span>
            </span>
          </label>

          {batchItems.length > 0 && (
            <div className="border-4 border-black bg-white p-3 font-comic text-sm">
              <p className="font-display text-lg">This consignment list</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {batchItems.map((row) => (
                  <li key={row.id}>
                    {row.title} — starting bid {formatCurrency(row.startingBid)} · buy now{" "}
                    {formatCurrency(row.buyNowPrice)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="comic-btn mt-3 w-full"
                disabled={emailingBatch}
                onClick={() => void emailMyList()}
              >
                {emailingBatch ? "Emailing…" : "I’m done adding items — email my list"}
              </button>
            </div>
          )}

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
          items={items.filter(
            (item) => item.pipelineStatus === "pending_approval" || item.pipelineStatus === "buy_now_pending",
          )}
          empty="Nothing waiting on approval."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Accepted lots</h2>
        <p className="font-comic text-sm">
          Filed into a sale by DealFinder. Check here for scheduled, live, or sold status.
        </p>
        <StatusTable
          items={items.filter(
            (item) => item.pipelineStatus !== "pending_approval" && item.pipelineStatus !== "buy_now_pending",
          )}
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

function readBatch(): ConsignorItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(BATCH_KEY);
    return raw ? (JSON.parse(raw) as ConsignorItem[]) : [];
  } catch {
    return [];
  }
}

function writeBatch(items: ConsignorItem[]) {
  try {
    window.sessionStorage.setItem(BATCH_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

function readBatchFlag() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(BATCH_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeBatchFlag(on: boolean) {
  try {
    window.sessionStorage.setItem(BATCH_FLAG_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
