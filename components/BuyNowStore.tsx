"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBidder } from "@/components/BidderProvider";
import { LotImage } from "@/components/LotImage";
import { invoiceFees } from "@/lib/invoiceFees";
import { buyNowPriceOf } from "@/lib/buyNow";
import { formatCurrency, lotImages, type AuctionLot } from "@/lib/utils";

export function BuyNowStore({ lots, compact = false }: { lots: AuctionLot[]; compact?: boolean }) {
  const { user, requestAuth } = useBidder();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startPurchase(lot: AuctionLot) {
    setError(null);
    if (!user) {
      requestAuth(undefined, "login");
      return;
    }
    setBusyId(lot.id);
    try {
      const response = await fetch("/api/buy-now", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Could not start checkout.");
      }
      router.push(String(json.checkout || `/checkout?lot=${encodeURIComponent(lot.id)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {compact ? null : (
        <div className="comic-panel p-5">
          <h1 className="font-display text-5xl text-brand-red">Buy Now</h1>
          <p className="mt-2 max-w-2xl font-comic text-lg">
            House-approved items, ready to pay today. No Sunday invoice wait. Pickup is hammer + 15%
            premium + 5% GST. Shipping adds a $10 handling fee plus postage, then GST.
          </p>
        </div>
      )}
      {error ? <p className="comic-panel bg-brand-red p-4 font-display text-2xl text-white">{error}</p> : null}
      {lots.length === 0 ? (
        <p className="comic-panel p-5 font-comic">Nothing listed for Buy Now right now. Check back after intake.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => {
            const hammer = buyNowPriceOf(lot) ?? lot.currentBid;
            const pickup = invoiceFees({ hammer, fulfillment: "pickup" });
            const shipped = invoiceFees({ hammer, fulfillment: "ship", shippingCost: 0 });
            const photo = lotImages(lot)[0];
            return (
              <article key={lot.id} className="comic-panel flex flex-col overflow-hidden">
                <div className="relative aspect-square bg-black">
                  <LotImage src={photo} alt={lot.title} fill className="object-contain" sizes="40vw" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h2 className="font-display text-2xl leading-none">{lot.title}</h2>
                  <p className="font-display text-3xl text-brand-red">{formatCurrency(hammer)}</p>
                  <p className="font-comic text-sm">
                    Pickup {formatCurrency(pickup.total)} (includes 15% premium + GST)
                  </p>
                  <p className="font-comic text-sm">
                    Ship from {formatCurrency(shipped.total)} + postage
                  </p>
                  <button
                    type="button"
                    className="comic-btn mt-auto"
                    disabled={busyId === lot.id}
                    onClick={() => void startPurchase(lot)}
                  >
                    {busyId === lot.id ? "Starting checkout…" : "Buy Now"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
