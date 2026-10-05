"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ImageUrlPaste } from "@/components/ImageUrlPaste";
import { PhotoDropzone } from "@/components/PhotoDropzone";
import { CONSIGNMENT_AGREEMENT_SECTIONS } from "@/lib/consignmentAgreement";
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
import { ItemDetailsField, ListingConditionField } from "@/components/ListingGradeFields";
import { type ListingGrade } from "@/lib/listingGrade";
import type { SlothPhotoPhase } from "@/lib/turboSloth";
import {
  formatCurrency,
  pipelineLabel,
  type ConsignorItem,
} from "@/lib/utils";

const COMMISSION_TIERS =
  CONSIGNMENT_AGREEMENT_SECTIONS.find((section) => section.heading.startsWith("3."))?.paragraphs ?? [];

const LOCAL_KEY = "dealfinder-consignor-items";

export default function ConsignorPage() {
  const { user, ready, requestAuth } = useBidder();
  const [consignorName, setConsignorName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrlText, setImageUrlText] = useState("");
  const [resolvedImageUrls, setResolvedImageUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingBid, setStartingBid] = useState("5");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoPhase, setPhotoPhase] = useState<SlothPhotoPhase | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const generating = photoPhase !== null;
  const generateLock = useRef(false);
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
  const [charity, setCharity] = useState(false);

  const buyNow = Number(buyNowPrice) || 0;

  async function loadItems() {
    const response = await fetch("/api/consignments", { credentials: "include", cache: "no-store" });
    const json = await parseApiJson<{ items?: ConsignorItem[]; error?: string }>(response);
    if (!response.ok) {
      setError(json.error || "Could not load status table");
      setItems(readLocal(consignorName || user?.fullName || ""));
      return;
    }
    clearLocal();
    setItems((json.items ?? []) as ConsignorItem[]);
  }

  useEffect(() => {
    try {
      window.sessionStorage.removeItem("dealfinder-consignment-batch");
      window.sessionStorage.removeItem("dealfinder-consignment-batch-on");
    } catch {
      /* ignore */
    }
  }, []);

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

  async function autoGenerate(fromFiles?: File[]) {
    if (generateLock.current) return;
    setError(null);
    setNotice(null);
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
      setTitle(String(catalog.title ?? ""));
      setDescription(String(catalog.description ?? ""));
      if (catalog.estimated_market_value) {
        setMarketValue(String(catalog.estimated_market_value));
      }
      setCompsNote(catalog.comps_note ? String(catalog.comps_note) : null);
      let run = catalog.ai ?? null;
      try {
        const studio = await requestStudioImage(
          {
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
          },
          setPhotoPhase,
        );
        setHeroIndex(studio.heroIndex);
        setStudioImageUrl(studio.url);
        run = mergeAiRuns(run, studio.ai);
        setNotice("Listing photo ready. Review, then submit.");
      } catch (studioErr) {
        setStudioImageUrl(null);
        setHeroIndex(0);
        setNotice(null);
        setError(studioErr instanceof Error ? studioErr.message : "Listing photo failed.");
      }
      setAiRun(run);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : "AI intake failed");
    } finally {
      generateLock.current = false;
      setPhotoPhase(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (requestBuyNow && buyNow <= 0) {
      setError("Enter a Buy Now price to list this item there.");
      return;
    }
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
          startingBid: Number(startingBid) > 0 ? Number(startingBid) : 5,
          buyNowPrice: buyNow,
          estimatedMarketValue: Number(marketValue) || 0,
          listingGrade,
          itemDetails,
          imageUrls,
          termsAccepted: true,
          saleChannel: requestBuyNow ? "buy_now" : "auction",
          requestBuyNow,
          charity,
        }),
      });
      const json = await parseApiJson<{ item?: ConsignorItem; error?: string }>(response);
      if (!response.ok) {
        throw new Error(json.error || "Submit failed");
      }
      const item = json.item as ConsignorItem;
      setItems((current) => [item, ...current.filter((row) => row.id !== item.id)]);
      setTermsOpen(false);
      setNotice(
        requestBuyNow
          ? "Submitted as Buy Now, pending admin approval. A confirmation email is on the way."
          : "Submitted for pending approval. A confirmation email is on the way. DealFinder will assign lot # and sale date.",
      );
      setRequestBuyNow(false);
      setCharity(false);
      setTitle("");
      setDescription("");
      setStartingBid("5");
      setBuyNowPrice("");
      setMarketValue("");
      setFiles([]);
      setImageUrlText("");
      setCompsNote(null);
      setStudioImageUrl(null);
      setHeroIndex(0);
      setPhotoPhase(null);
      setAiRun(null);
      setItemDetails("");
      setListingGrade("Used");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
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

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div className="comic-panel flex h-full flex-col space-y-4 p-6">
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
          <div className="flex-1">
            <ItemDetailsField details={itemDetails} onDetails={setItemDetails} />
          </div>
        </div>

        <div className="comic-panel flex h-full flex-col space-y-4 p-6">
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
            Starting bid ($)
            <span className="block font-normal">
              Lots open at $5. Type a lower price to open this item there. The next item goes back to $5.
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={startingBid}
              onChange={(e) => setStartingBid(e.target.value)}
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Buy now ($)
            <span className="block font-normal">
              Optional. Leave this blank to consign for the live auction only. A price also lists the
              item on Buy Now after DealFinder approves it.
            </span>
            <input
              type="number"
              min={0}
              value={buyNowPrice}
              onChange={(e) => setBuyNowPrice(e.target.value)}
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
            <p className="font-display text-lg">House commission</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {COMMISSION_TIERS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2">
              Final commission follows the agreement you accept on submit. You cannot pick a custom
              percent here.
            </p>
          </div>

          <label className="flex items-start gap-2 font-comic text-sm font-bold">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={charity}
              onChange={(e) => setCharity(e.target.checked)}
            />
            <span>
              Charity consignment
              <span className="block font-normal">
                Check this if the proceeds are for a charity or fundraising partner. Staff will see it
                when they approve the lot.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 font-comic text-sm font-bold">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={requestBuyNow}
              onChange={(e) => setRequestBuyNow(e.target.checked)}
            />
            <span>
              Also list on Buy Now
              <span className="block font-normal">
                Needs a Buy Now price. After approval it stays in the live auction and appears on Buy
                Now.
              </span>
            </span>
          </label>

          {aiRun && !generating ? (
            <AiFeedback
              run={aiRun}
              summary={[title, description, compsNote].filter(Boolean).join(" · ")}
            />
          ) : null}
        </div>
        </div>

        <div className="comic-panel space-y-4 p-6">
          <ListingConditionField grade={listingGrade} onGrade={setListingGrade} />
          <div className="flex flex-row items-end gap-3">
            <button
              type="button"
              className="comic-btn w-full sm:flex-1"
              onClick={() => void autoGenerate()}
              disabled={generating}
            >
              {generating ? "Cataloging + studio photo…" : "Auto-Generate Details"}
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-label={submitting ? "Submitting" : "Submit for approval"}
              className="block bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/consign-submit.png" alt="" className="h-36 w-auto sm:h-44" />
            </button>
          </div>
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
            (item) =>
              item.pipelineStatus !== "pending_approval" &&
              item.pipelineStatus !== "buy_now_pending" &&
              item.pipelineStatus !== "rejected",
          )}
          empty="No accepted lots yet."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Not accepted</h2>
        <StatusTable
          items={items.filter((item) => item.pipelineStatus === "rejected")}
          empty="Nothing was turned down."
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
              <p className="font-bold uppercase">
                {pipelineLabel(item.pipelineStatus)}
                {item.lotNumber ? ` · ${item.lotNumber}` : ""}
                {item.charity ? " · Charity" : ""}
              </p>
              {item.lotHref ? (
                <a href={item.lotHref} className="font-bold underline">
                  Open in the live auction
                </a>
              ) : null}
              <p>Opens at {formatCurrency(item.startingBid || 0)}</p>
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
              <th className="border-b-4 border-black p-3">Opens at</th>
              <th className="border-b-4 border-black p-3">Buy now</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="bg-brand-cream">
                <td className="p-3" colSpan={5}>
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
                    {item.lotNumber ? ` · ${item.lotNumber}` : ""}
                    {item.charity ? " · Charity" : ""}
                    {item.lotHref ? (
                      <a href={item.lotHref} className="mt-1 block font-bold normal-case underline">
                        Open in the live auction
                      </a>
                    ) : null}
                  </td>
                  <td className="border-b-2 border-black p-3">
                    {formatCurrency(item.startingBid || 0)}
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

function clearLocal() {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

