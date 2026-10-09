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
import { requestCatalog, heroPhotoForStudio } from "@/lib/aiIntakeClient";
import { parseApiJson } from "@/lib/apiJson";
import { requestStudioImage } from "@/lib/studioClient";
import { mergeAiRuns, type AiRun } from "@/lib/aiRuns";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { ItemDetailsField, ListingConditionField } from "@/components/ListingGradeFields";
import { type ListingGrade } from "@/lib/listingGrade";
import type { SlothPhotoPhase } from "@/lib/turboSloth";
import { buyNowDisclaimer, buyNowOfferError } from "@/lib/buyNowOffer";
import { canClearItem, isActiveAccepted, isPayoutRow } from "@/lib/consignorPortal";
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
  const [charity, setCharity] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [counterBusy, setCounterBusy] = useState<string | null>(null);

  const buyNow = Number(buyNowPrice) || 0;
  const openCounters = items.filter(
    (item) =>
      !item.clearedAt &&
      item.pipelineStatus === "rejected" &&
      item.counterStatus === "offered" &&
      (item.counterOffer ?? 0) > 0,
  );

  async function respondToCounter(id: string, action: "accept-counter" | "decline-counter") {
    setCounterBusy(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/consignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const json = await parseApiJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(json.error || "Could not update that counter.");
      setNotice(
        action === "accept-counter"
          ? "Counter accepted. It is back with DealFinder for approval. You are paid that amount if it sells."
          : "Counter declined. That item stays turned down.",
      );
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that counter.");
    } finally {
      setCounterBusy(null);
    }
  }

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
        setNotice("Listing photo ready. Review, then submit.");
      } catch (studioErr) {
        setStudioImageUrl(null);
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
    const offerError = buyNowOfferError(buyNow);
    if (offerError) {
      setNotice(null);
      setError(offerError);
      return;
    }
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
          startingBid: Number(startingBid) > 0 ? Number(startingBid) : 5,
          buyNowPrice: buyNow,
          estimatedMarketValue: Number(marketValue) || 0,
          listingGrade,
          itemDetails,
          imageUrls,
          termsAccepted: true,
          saleChannel: buyNow > 0 ? "buy_now" : "auction",
          requestBuyNow: buyNow > 0,
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
        buyNow > 0
          ? "Submitted as Buy Now, pending admin approval. A confirmation email is on the way."
          : "Submitted for pending approval. A confirmation email is on the way. DealFinder will assign lot # and sale date.",
      );
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
          Drop up to 4 warehouse photos, add any details, then press Auto-Generate Details.
          That writes the title, description, and studio listing photo. After we approve the
          item, DealFinder assigns the lot number and sale date.
        </p>
      </div>

      {openCounters.length > 0 ? (
        <section id="counters" className="space-y-3">
          <h2 className="font-display text-3xl text-brand-red">Counter offers</h2>
          <p className="font-comic text-sm">
            DealFinder turned these down at your price. Each counter is what you are paid if that
            item sells. There is no commission. Accept sends it back for approval. Decline leaves it
            turned down.
          </p>
          <div className="space-y-3">
            {openCounters.map((item) => (
              <article key={item.id} className="comic-panel space-y-2 p-4 font-comic">
                <p className="font-display text-2xl leading-6">{item.title}</p>
                <p>You asked {formatCurrency(item.askedOffer || item.buyNowPrice || 0)}</p>
                <p>
                  DealFinder&apos;s counter <strong>{formatCurrency(item.counterOffer || 0)}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="comic-btn !text-base"
                    disabled={counterBusy === item.id}
                    onClick={() => void respondToCounter(item.id, "accept-counter")}
                  >
                    Accept counter
                  </button>
                  <button
                    type="button"
                    className="comic-btn-invert !text-base"
                    disabled={counterBusy === item.id}
                    onClick={() => void respondToCounter(item.id, "decline-counter")}
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
                Photos wait here until you press Auto-Generate Details
              </p>
            )}
            {(studioImageUrl || resolvedImageUrls[0] || filePreview) && (
              <p className="absolute bottom-2 left-2 border-4 border-black bg-white px-2 py-1 font-comic text-xs">
                {studioImageUrl ? "AI listing photo" : "Uploaded photo"}
              </p>
            )}
          </div>
          <PhotoDropzone files={files} onChange={setFiles} maxFiles={4} />
          <ImageUrlPaste value={imageUrlText} onChange={setImageUrlText} />
          <ItemDetailsField details={itemDetails} onDetails={setItemDetails} />
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
            <GrowingTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={2}
              maxRows={8}
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
              step="1"
              value={startingBid}
              onChange={(e) => setStartingBid(e.target.value)}
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="block font-comic font-bold">
            Buy now — what you want to receive ($)
            <span className="block font-normal">
              Optional, and $100 minimum from this point on. This is the amount you are paid if it
              sells. There is no commission. DealFinder sets the price buyers pay. Leave it blank to
              consign for the live auction, where the agreement commission applies.
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={buyNowPrice}
              onChange={(e) => setBuyNowPrice(e.target.value)}
              className="mt-2 w-full border-4 border-black bg-white px-3 py-2 font-normal"
            />
          </label>
          {buyNow > 0 && buyNow < 100 ? (
            <p className="border-4 border-black bg-brand-cream p-3 font-comic text-sm text-brand-red">
              {buyNowOfferError(buyNow)}
            </p>
          ) : null}
          {buyNow >= 100 ? (
            <p className="border-4 border-black bg-brand-cream p-3 font-comic text-sm">
              {buyNowDisclaimer(buyNow)}
            </p>
          ) : null}
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
            <p className="whitespace-pre-line border-4 border-black bg-brand-cream p-3 font-comic text-sm">{compsNote}</p>
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
          <p className="font-comic text-sm">
            Item details are optional. Cataloging starts only when you press Auto-Generate Details.
          </p>
          <div className="flex flex-row items-end gap-3">
            <button
              type="button"
              className="comic-btn w-full disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
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
            (item) =>
              !item.clearedAt &&
              (item.pipelineStatus === "pending_approval" || item.pipelineStatus === "buy_now_pending"),
          )}
          empty="Nothing waiting on approval."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Accepted lots</h2>
        <p className="font-comic text-sm">
          Filed into a sale and still on the floor. Sold lots move to payouts below.
        </p>
        <StatusTable
          items={items.filter((item) => !item.clearedAt && isActiveAccepted(item))}
          empty="No accepted lots on the floor right now."
        />
      </section>

      <PayoutSection
        items={items.filter((item) => isPayoutRow(item))}
        clearing={clearing}
        onExport={() => {
          window.location.href = "/api/consignments/export";
        }}
        onClearPaid={async () => {
          const ids = items.filter((item) => canClearItem(item)).map((item) => item.id);
          if (ids.length === 0) {
            setNotice("Nothing paid out yet to clear. After DealFinder sends your payout, export it and clear it here.");
            return;
          }
          setClearing(true);
          setError(null);
          try {
            window.location.href = "/api/consignments/export";
            const response = await fetch("/api/consignments", {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "clear", ids }),
            });
            const json = await parseApiJson<{ error?: string; cleared?: number }>(response);
            if (!response.ok) throw new Error(json.error || "Could not clear paid-out items.");
            setItems((current) =>
              current.map((item) =>
                ids.includes(item.id) ? { ...item, clearedAt: new Date().toISOString() } : item,
              ),
            );
            setNotice(
              `Exported your spreadsheet and cleared ${json.cleared ?? ids.length} paid-out item${(json.cleared ?? ids.length) === 1 ? "" : "s"} off this page.`,
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not clear paid-out items.");
          } finally {
            setClearing(false);
          }
        }}
      />

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-brand-red">Not accepted</h2>
        <StatusTable
          items={items.filter(
            (item) =>
              !item.clearedAt &&
              item.pipelineStatus === "rejected" &&
              !(item.counterStatus === "offered" && (item.counterOffer ?? 0) > 0),
          )}
          empty="Nothing was turned down."
        />
      </section>

      {items.some((item) => item.clearedAt) ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-3xl text-brand-red">Cleared from this page</h2>
            <button type="button" className="comic-btn-invert !text-sm" onClick={() => setShowCleared((on) => !on)}>
              {showCleared ? "Hide cleared" : "Show cleared"}
            </button>
          </div>
          {showCleared ? (
            <StatusTable
              mode="payout"
              items={items.filter((item) => Boolean(item.clearedAt))}
              empty="Nothing cleared yet."
            />
          ) : (
            <p className="font-comic text-sm">
              {items.filter((item) => item.clearedAt).length} finished item
              {items.filter((item) => item.clearedAt).length === 1 ? "" : "s"} exported and taken off the main list.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function PayoutSection({
  items,
  clearing,
  onExport,
  onClearPaid,
}: {
  items: ConsignorItem[];
  clearing: boolean;
  onExport: () => void;
  onClearPaid: () => Promise<void>;
}) {
  const owed = items.filter((item) => item.pipelineStatus === "sold");
  const paid = items.filter((item) => item.pipelineStatus === "paid_out");
  const owedTotal = owed.reduce((sum, item) => sum + (item.payout ?? 0), 0);
  const paidTotal = paid.reduce((sum, item) => sum + (item.payout ?? 0), 0);

  return (
    <section className="space-y-3">
      <h2 className="font-display text-3xl text-brand-red">Payouts</h2>
      <p className="font-comic text-sm">
        Sold lots stay here so you can see what DealFinder still owes you and what has already
        been paid out. Export the spreadsheet any time. After a payout is sent, export and clear
        those rows so this page does not fill up.
      </p>
      <div className="flex flex-wrap gap-3 font-comic text-sm">
        <span className="border-4 border-black bg-white px-3 py-2">
          Still owed <strong>{formatCurrency(owedTotal)}</strong> · {owed.length} lot{owed.length === 1 ? "" : "s"}
        </span>
        <span className="border-4 border-black bg-white px-3 py-2">
          Paid out <strong>{formatCurrency(paidTotal)}</strong> · {paid.length} lot{paid.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="comic-btn" onClick={onExport}>
          Export to Excel
        </button>
        <button type="button" className="comic-btn-invert" disabled={clearing || paid.length === 0} onClick={() => void onClearPaid()}>
          {clearing ? "Clearing…" : "Export paid-out and clear them"}
        </button>
      </div>
      <StatusTable mode="payout" items={items} empty="No sold lots waiting on a payout yet." />
    </section>
  );
}

function offerLine(item: ConsignorItem) {
  if (!(item.buyNowPrice > 0)) return "Auction only";
  if (item.commissionRate === 0) return `You receive ${formatCurrency(item.buyNowPrice)}`;
  return `Buy now ${formatCurrency(item.buyNowPrice)}`;
}

function StatusTable({
  items,
  empty,
  mode = "simple",
}: {
  items: ConsignorItem[];
  empty: string;
  mode?: "simple" | "payout";
}) {
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
              <p>{offerLine(item)}</p>
              {mode === "payout" ? (
                <>
                  <p>Hammer {item.hammer == null ? "—" : formatCurrency(item.hammer)}</p>
                  <p>Your payout {item.hammer == null ? "—" : formatCurrency(item.payout || 0)}</p>
                  <p>Buyer {item.buyerPaidAt ? "paid" : "still owes"}</p>
                </>
              ) : null}
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
              <th className="border-b-4 border-black p-3">You receive</th>
              {mode === "payout" ? (
                <>
                  <th className="border-b-4 border-black p-3">Hammer</th>
                  <th className="border-b-4 border-black p-3">Your payout</th>
                  <th className="border-b-4 border-black p-3">Buyer</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="bg-brand-cream">
                <td className="p-3" colSpan={mode === "payout" ? 8 : 5}>
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
                  <td className="border-b-2 border-black p-3">{offerLine(item)}</td>
                  {mode === "payout" ? (
                    <>
                      <td className="border-b-2 border-black p-3">
                        {item.hammer == null ? "—" : formatCurrency(item.hammer)}
                      </td>
                      <td className="border-b-2 border-black p-3 font-bold">
                        {item.hammer == null ? "—" : formatCurrency(item.payout || 0)}
                      </td>
                      <td className="border-b-2 border-black p-3">
                        {item.buyerPaidAt ? "Paid" : "Still owes"}
                      </td>
                    </>
                  ) : null}
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

