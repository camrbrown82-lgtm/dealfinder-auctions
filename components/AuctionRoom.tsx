"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBidder } from "@/components/BidderProvider";
import { LotTimer } from "@/components/LotTimer";
import { nextLiveAmount } from "@/lib/bidding";
import { isProfileComplete } from "@/lib/profileTypes";
import { HelcimPayModal } from "@/components/HelcimPayModal";
import { PreauthDisclaimer } from "@/components/PreauthDisclaimer";
import { fulfillmentInstructions } from "@/lib/payments";
import type { FulfillmentChoice } from "@/lib/payments";
import { profileAddress } from "@/lib/profileTypes";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { buyNowPriceOf, canBuyNow } from "@/lib/buyNow";
import { recordInterest } from "@/lib/interest";
import { LotImage } from "@/components/LotImage";
import {
  extraLotImages,
  formatCurrency,
  parseLotEndMs,
  type AuctionLot,
} from "@/lib/utils";

type BidRow = {
  bidder: string;
  amount: number;
  kind: "live" | "absentee";
};

export function AuctionRoom({ lot }: { lot: AuctionLot }) {
  const router = useRouter();
  const { user, requestAuth, refresh } = useBidder();
  const [currentBid, setCurrentBid] = useState(lot.currentBid);
  const [endsAt, setEndsAt] = useState(lot.endsAt);
  const [highBidder, setHighBidder] = useState(lot.highBidder ?? null);
  const [highBidderId, setHighBidderId] = useState(lot.highBidderId ?? null);
  const [status, setStatus] = useState<AuctionLot["status"]>(lot.status ?? "live");
  const [extended, setExtended] = useState(false);
  const [mode, setMode] = useState<"live" | "absentee">("live");
  const [maxAmount, setMaxAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [feed, setFeed] = useState<BidRow[]>([]);
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>(lot.fulfillment ?? "unset");
  const [helcimOpen, setHelcimOpen] = useState(false);
  const pendingBid = useRef<{
    mode: "live" | "absentee" | "buy_now";
    amount: number;
    maxAmount: number;
  } | null>(null);
  const openRef = useRef(false);
  const placeBidRef = useRef<() => Promise<void>>(async () => undefined);

  const nextBid = useMemo(
    () => nextLiveAmount(currentBid, lot.minIncrement),
    [currentBid, lot.minIncrement],
  );
  const buyNow = buyNowPriceOf(lot);
  const extras = extraLotImages(lot);
  const hasWinner = Boolean(highBidder || highBidderId);
  const soldClosed = status === "ended" && hasWinner;
  const open = status !== "removed" && !soldClosed;
  openRef.current = open;
  const youWon =
    soldClosed &&
    Boolean(
      user &&
        (highBidderId === user.id ||
          highBidder === user.fullName ||
          highBidder === user.email),
    );
  const showBuyNow = open && canBuyNow(currentBid, buyNow);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void fetch(`/api/bids?lotId=${encodeURIComponent(lot.id)}`, { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json.bids)) setFeed(json.bids);
      })
      .catch(() => undefined);
  }, [lot.id]);

  useEffect(() => {
    void fetch("/api/live-clock", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        const row = Array.isArray(json.lots)
          ? json.lots.find((item: { id?: string }) => item.id === lot.id)
          : null;
        if (!row) return;
        if (row.currentBid != null) setCurrentBid(Number(row.currentBid));
        if (row.highBidder !== undefined) setHighBidder(row.highBidder);
        if (row.status === "removed") setStatus("removed");
        else setStatus("live");
        if (row.endsAt) {
          setEndsAt((prev) => {
            if (row.status === "ended" || row.status === "removed") return String(row.endsAt);
            const nextEnd = parseLotEndMs(String(row.endsAt));
            const prevEnd = parseLotEndMs(prev);
            if (
              Number.isFinite(prevEnd) &&
              prevEnd > Date.now() &&
              Number.isFinite(nextEnd) &&
              nextEnd <= Date.now()
            ) {
              return prev;
            }
            return String(row.endsAt);
          });
        }
      })
      .catch(() => undefined);
  }, [lot.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`bids-lot-${lot.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bids",
          filter: `lot_id=eq.${lot.id}`,
        },
        (payload) => {
          const row = payload.new as {
            bidder_name?: string;
            amount?: number | string;
            kind?: string;
          };
          if (row.amount == null) return;
          setCurrentBid(Number(row.amount));
          setHighBidder(row.bidder_name ?? null);
          setFeed((current) =>
            [
              {
                bidder: row.bidder_name ?? "Paddle",
                amount: Number(row.amount),
                kind: (row.kind === "absentee" ? "absentee" : "live") as BidRow["kind"],
              },
              ...current,
            ].slice(0, 12),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lots",
          filter: `id=eq.${lot.id}`,
        },
        (payload) => {
          const next = payload.new as {
            current_bid?: number | string;
            ends_at?: string;
            high_bidder?: string | null;
            high_bidder_id?: string | null;
            status?: AuctionLot["status"];
            fulfillment?: FulfillmentChoice;
          };
          if (next.current_bid != null) setCurrentBid(Number(next.current_bid));
          if (next.high_bidder !== undefined) setHighBidder(next.high_bidder);
          if (next.high_bidder_id !== undefined) setHighBidderId(next.high_bidder_id);
          if (next.fulfillment === "ship" || next.fulfillment === "pickup" || next.fulfillment === "unset") {
            setFulfillment(next.fulfillment);
          }
          if (next.status === "removed" || next.status === "ended") setStatus(next.status);
          else if (next.status) setStatus(next.status);
          if (next.ends_at) {
            setEndsAt((prev) => {
              if (next.status === "ended" || next.status === "removed") return next.ends_at!;
              const nextEnd = parseLotEndMs(next.ends_at);
              const prevEnd = parseLotEndMs(prev);
              if (Number.isFinite(nextEnd) && Number.isFinite(prevEnd) && nextEnd > prevEnd) {
                setExtended(true);
              }
              if (Number.isFinite(prevEnd) && prevEnd > Date.now() && Number.isFinite(nextEnd) && nextEnd <= Date.now()) {
                return prev;
              }
              return next.ends_at!;
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lot.id]);

  async function placeBid() {
    const intent = pendingBid.current ?? {
      mode,
      amount: nextBid,
      maxAmount: Number(maxAmount),
    };
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/bids", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId: lot.id,
          mode: intent.mode,
          amount: intent.amount,
          maxAmount: intent.maxAmount,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        const err = json.error;
        const text =
          typeof err === "string"
            ? err
            : err && typeof err === "object" && "message" in err
              ? String((err as { message: string }).message)
              : "Bid failed";
        if (response.status === 402 || json.code === "PREAUTH_REQUIRED") {
          setHelcimOpen(true);
          throw new Error("Authorize the $50 bidding hold, then we drop the paddle.");
        }
        throw new Error(text);
      }
      recordInterest(lot);
      pendingBid.current = null;

      setCurrentBid(json.currentBid);
      setEndsAt(json.endsAt);
      setHighBidder(json.highBidder);
      if (json.highBidderId) setHighBidderId(json.highBidderId);
      setExtended(Boolean(json.extended));
      if (Array.isArray(json.events)) {
        setFeed((current) => [...json.events.slice().reverse(), ...current].slice(0, 12));
      }
      if (json.status) setStatus(json.status);
      if (json.boughtNow) {
        setStatus("ended");
        setMessage(`You won this lot for ${formatCurrency(json.currentBid)}. Choose ship or pick up below, then settle payment.`);
        router.push("/checkout");
        return;
      }
      setMessage(
        json.extended
          ? `Bid in. Clock extended +2:00 (anti-snipe). High ${formatCurrency(json.currentBid)}`
          : `High bid is now ${formatCurrency(json.currentBid)}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bid failed.");
    } finally {
      setBusy(false);
    }
  }
  placeBidRef.current = placeBid;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    pendingBid.current = {
      mode,
      amount: nextBid,
      maxAmount: Number(maxAmount),
    };
    if (!user || !isProfileComplete(user)) {
      requestAuth(() => placeBidRef.current(), "login");
      return;
    }
    if (user.preauthStatus !== "held") {
      setHelcimOpen(true);
      return;
    }
    await placeBid();
  }

  async function chooseFulfillment(next: FulfillmentChoice) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/wins", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.id, fulfillment: next }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Could not save delivery.");
      }
      setFulfillment(next);
      setMessage(next === "ship" ? "We will ship this lot." : "Marked for pickup.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save delivery.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 comic-panel p-4 sm:flex-row sm:items-center">
        <div>
          <p className="font-display text-sm tracking-[0.25em] text-brand-red">LIVE HAMMER</p>
          <p className="break-words font-display text-4xl text-brand-red">{formatCurrency(currentBid)}</p>
          <p className="font-comic text-sm">
            {highBidder ? `High bidder: ${highBidder}` : "No bids yet — open the floor"}
          </p>
        </div>
        <LotTimer endsAt={endsAt} extended={extended} />
      </div>

        {youWon ? (
          <div className="comic-panel space-y-3 p-5">
            <p className="font-display text-sm tracking-[0.25em] text-brand-red">YOU WON THIS LOT</p>
            <p className="font-display text-3xl">Hammer {formatCurrency(currentBid)}</p>
            <p className="font-comic text-sm">
              Pay the hammer with Helcim at checkout. The $50 bidding hold is reversed as soon as
              this sale goes through. Choose ship or pick up here — that choice is made after the win.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                className={fulfillment === "ship" ? "comic-btn" : "comic-btn-invert"}
                onClick={() => void chooseFulfillment("ship")}
              >
                Ship it
              </button>
              <button
                type="button"
                disabled={busy}
                className={fulfillment === "pickup" ? "comic-btn" : "comic-btn-invert"}
                onClick={() => void chooseFulfillment("pickup")}
              >
                Pick up
              </button>
            </div>
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
              {fulfillmentInstructions(fulfillment, user ? profileAddress(user) : "")}
            </p>
            <Link href="/checkout" className="comic-btn inline-block">
              Pay with Helcim
            </Link>
            {message ? <p className="font-display text-xl">{message}</p> : null}
          </div>
        ) : status === "removed" ? (
          <div className="comic-panel space-y-3 p-5">
            <p className="font-display text-sm tracking-[0.25em] text-brand-red">PULLED FROM THE SALE</p>
            <p className="font-comic text-sm">
              This lot is no longer on the live floor. House staff moved it to unsold or settlements.
            </p>
            <Link href="/live" className="comic-btn inline-block">
              Back to live lots
            </Link>
          </div>
        ) : soldClosed ? (
          <div className="comic-panel space-y-3 p-5">
            <p className="font-display text-sm tracking-[0.25em] text-brand-red">SOLD</p>
            <p className="font-display text-3xl">Hammer {formatCurrency(currentBid)}</p>
            <p className="font-comic text-sm">
              {highBidder ? `Won by ${highBidder}.` : "This lot is closed."} It is on the settlement desk.
            </p>
            <Link href="/live" className="comic-btn inline-block">
              Back to live lots
            </Link>
          </div>
        ) : (
        <form
        onSubmit={onSubmit}
        className="comic-panel space-y-4 p-5"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={mode === "live" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
            onClick={() => setMode("live")}
          >
            Live bid
          </button>
          <button
            type="button"
            className={mode === "absentee" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
            onClick={() => setMode("absentee")}
          >
            Absentee max
          </button>
        </div>
        {showBuyNow && buyNow ? (
          <button
            type="button"
            className="comic-btn w-full"
            disabled={busy}
            onClick={() => {
              pendingBid.current = { mode: "buy_now", amount: buyNow, maxAmount: buyNow };
              if (!user || !isProfileComplete(user)) {
                requestAuth(() => placeBidRef.current(), "login");
                return;
              }
              if (user.preauthStatus !== "held") {
                setHelcimOpen(true);
                return;
              }
              void placeBid();
            }}
          >
            Buy now {formatCurrency(buyNow)}
          </button>
        ) : null}

        <p className="font-comic text-sm">
          {user ? (
            <>
              Paddle: <strong>{user.fullName}</strong> — guests can watch the tape;
              placing a bid uses this account. Helcim holds $50 on first bid.
            </>
          ) : (
            <>
              Watch the room free. <strong>Place Bid</strong> or{" "}
              <strong>Set Absentee Bid</strong> opens the paddle gate — we keep your
              amount and submit it after you log in. First bid asks Helcim for a $50 hold.
            </>
          )}
        </p>
        <PreauthDisclaimer compact />

        {mode === "live" ? (
          <p className="font-comic text-sm">
            Next live paddle: <strong>{formatCurrency(nextBid)}</strong> (+
            {formatCurrency(lot.minIncrement)})
          </p>
        ) : (
          <label className="block font-comic text-sm font-bold">
            Maximum absentee bid ($)
            <input
              type="number"
              min={nextBid}
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              placeholder={String(nextBid)}
              disabled={!open}
              required={mode === "absentee"}
            />
            <span className="mt-1 block font-normal">
              We auto-increment by {formatCurrency(lot.minIncrement)} against other paddles
              up to this ceiling. Your max stays hidden.
            </span>
          </label>
        )}

        <button type="submit" className="comic-btn w-full" disabled={busy}>
          {busy
            ? "Placing…"
            : !open
              ? `Place Bid ${formatCurrency(nextBid)}`
              : mode === "live"
                ? `Place Bid ${formatCurrency(nextBid)}`
                : "Set Absentee Bid"}
        </button>

        {!isSupabaseConfigured && (
          <p className="font-comic text-xs">
            Demo mode: highest bid updates here; connect Supabase for multi-browser
            websockets on the bids table.
          </p>
        )}
        {message && <p className="font-display text-xl">{message}</p>}
      </form>
        )}

      <HelcimPayModal
        open={helcimOpen}
        purpose="bid_preauth"
        lotId={lot.id}
        onClose={() => setHelcimOpen(false)}
        onComplete={() => {
          setHelcimOpen(false);
          void refresh().then(() => placeBidRef.current());
        }}
      />

      <div className="comic-panel p-4">
        <p className="font-display text-2xl">Bid tape</p>
        {feed.length === 0 ? (
          <p className="font-comic text-sm">Waiting for the first paddle…</p>
        ) : (
          <ul className="mt-2 space-y-1 font-comic text-sm">
            {feed.map((row, index) => (
              <li key={`${row.bidder}-${row.amount}-${index}`}>
                <strong>{formatCurrency(row.amount)}</strong> · {row.bidder} ·{" "}
                {row.kind === "absentee" ? "absentee auto" : "live"}
              </li>
            ))}
          </ul>
        )}
      </div>

      {extras.length > 0 ? (
        <div className="comic-panel p-4">
          <p className="font-display text-2xl">Submitted photos</p>
          <p className="font-comic text-sm">Warehouse shots from intake, after the listing photo.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {extras.map((src) => (
              <div key={src} className="relative aspect-square overflow-hidden border-4 border-black bg-white">
                <LotImage src={src} alt={`${lot.title} submitted photo`} fill className="object-cover" sizes="40vw" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
