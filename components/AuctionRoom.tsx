"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useBidder } from "@/components/BidderProvider";
import { BidAgreementModal } from "@/components/BidAgreementModal";
import { BidPaymentModal } from "@/components/BidPaymentModal";
import { HelcimPayModal } from "@/components/HelcimPayModal";
import { LotTimer } from "@/components/LotTimer";
import { nextLiveAmount } from "@/lib/bidding";
import { INCREMENT_TABLE_COPY, structuredIncrement } from "@/lib/bidIncrements";
import { isProfileComplete } from "@/lib/profileTypes";
import { fulfillmentInstructions } from "@/lib/payments";
import type { FulfillmentChoice } from "@/lib/payments";
import { profileAddress } from "@/lib/profileTypes";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { recordInterest } from "@/lib/interest";
import { LotImage } from "@/components/LotImage";
import { auctionTermsPack, type AuctionTermsPack } from "@/lib/auctionTerms";
import {
  extraLotImages,
  formatCurrency,
  isLotOpen,
  parseLotEndMs,
  type AuctionLot,
} from "@/lib/utils";

type BidRow = {
  bidder: string;
  amount: number;
  kind: "live" | "absentee";
};

function mergeTape(current: BidRow[], incoming: BidRow[]) {
  const seen = new Set<string>();
  const unique: BidRow[] = [];
  for (const row of [...incoming, ...current]) {
    const key = `${row.bidder}|${row.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= 12) break;
  }
  return unique;
}

export function AuctionRoom({ lot }: { lot: AuctionLot }) {
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
  const [feed, setFeed] = useState<BidRow[]>([]);
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>(lot.fulfillment ?? "unset");
  const [registered, setRegistered] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [authStatus, setAuthStatus] = useState<string>("none");
  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [helcimOpen, setHelcimOpen] = useState(false);
  const [terms, setTerms] = useState<AuctionTermsPack | null>(null);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [agreeBusy, setAgreeBusy] = useState(false);
  const [agreeError, setAgreeError] = useState<string | null>(null);
  const pendingBid = useRef<{
    mode: "live" | "absentee";
    amount: number;
    maxAmount: number;
  } | null>(null);
  const openRef = useRef(false);
  const placeBidRef = useRef<() => Promise<void>>(async () => undefined);
  const ensureBidRef = useRef<() => Promise<void>>(async () => undefined);

  const increment = structuredIncrement(currentBid);
  const nextBid = useMemo(
    () => nextLiveAmount(currentBid, increment, highBidder || highBidderId),
    [currentBid, increment, highBidder, highBidderId],
  );
  const extras = extraLotImages(lot);
  const hasWinner = Boolean(highBidder || highBidderId);
  const soldClosed = status === "ended" && hasWinner;
  const open =
    status !== "removed" &&
    !soldClosed &&
    lot.biddingOpen !== false &&
    isLotOpen({ endsAt, status });
  openRef.current = open;
  // The bidder id decides who won. A display name is shared easily, and matching
  // on it told the wrong paddle it had bought the lot.
  const youWon =
    soldClosed &&
    Boolean(
      user &&
        (highBidderId
          ? highBidderId === user.id
          : Boolean(user.fullName) && highBidder === user.fullName),
    );
  useEffect(() => {
    if (!user || !lot.eventId) {
      setRegistered(false);
      setAuthorized(false);
      return;
    }
    let cancelled = false;
    void fetch(`/api/auctions/register?eventId=${encodeURIComponent(lot.eventId)}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.terms) setTerms(json.terms as AuctionTermsPack);
        setRegistered(Boolean(json.registered));
        setAuthorized(Boolean(json.authorized));
        setAuthStatus(String(json.authStatus || "none"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, lot.eventId]);

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
            mergeTape(current, [
              {
                bidder: row.bidder_name ?? "Paddle",
                amount: Number(row.amount),
                kind: (row.kind === "absentee" ? "absentee" : "live") as BidRow["kind"],
              },
            ]),
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
              : "That bid did not land. Try again.";
        if (json.code === "CROSS_BID") {
          if (json.currentBid != null) setCurrentBid(Number(json.currentBid));
          if (json.highBidder !== undefined) setHighBidder(json.highBidder);
          if (json.highBidderId !== undefined) setHighBidderId(json.highBidderId ?? null);
          throw new Error(text);
        }
        if (response.status === 402 || json.code === "AUCTION_TERMS_REQUIRED") {
          setRegistered(false);
          setAgreeOpen(true);
          throw new Error("Agree to this sale's terms, then authorize your paddle, and we will send the bid.");
        }
        if (json.code === "CASH_PENDING") {
          setPayOpen(true);
          setAuthStatus("pending");
          throw new Error(text);
        }
        if (json.code === "BID_AUTH_REQUIRED" || json.code === "PREAUTH_TERMS_REQUIRED") {
          setPayOpen(true);
          throw new Error(text);
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
        setFeed((current) => mergeTape(current, json.events.slice().reverse()));
      }
      if (json.status) setStatus(json.status);
      setMessage(
        json.extended
          ? `Bid in. Clock extended +2:00 (anti-snipe). High ${formatCurrency(json.currentBid)}`
          : `High bid is now ${formatCurrency(json.currentBid)}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That bid did not land. Try again.");
    } finally {
      setBusy(false);
    }
  }
  placeBidRef.current = placeBid;

  async function ensureBid() {
    if (!user || !isProfileComplete(user)) {
      requestAuth(() => ensureBidRef.current(), "login");
      return;
    }
    if (!lot.eventId) {
      setMessage("This lot is not on a sale yet.");
      return;
    }
    if (!registered) {
      if (!terms) {
        setTerms(
          auctionTermsPack({
            name: lot.auctionNumber ? `Weekly sale · ${lot.auctionNumber}` : "This auction",
            auctionNumber: lot.auctionNumber,
            startsAt: lot.endsAt,
            endsAt: lot.endsAt,
          }),
        );
      }
      setAgreeError(null);
      setAgreeOpen(true);
      return;
    }
    if (!authorized) {
      setPayError(authStatus === "pending" ? "Cash pickup is waiting on desk approval." : null);
      setPayOpen(true);
      return;
    }
    await placeBid();
  }
  ensureBidRef.current = ensureBid;

  async function confirmAgreementAndBid() {
    if (!lot.eventId) return;
    setAgreeBusy(true);
    setAgreeError(null);
    try {
      const response = await fetch("/api/auctions/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: lot.eventId,
          termsAgreed: true,
          preauthAgreed: true,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "We could not save your agreement. Try again.");
      }
      setRegistered(true);
      setAgreeOpen(false);
      await refresh();
      if (json.authorized) {
        setAuthorized(true);
        await placeBid();
        return;
      }
      setAuthorized(false);
      setAuthStatus(String(json.authStatus || "none"));
      setPayOpen(true);
    } catch (error) {
      setAgreeError(error instanceof Error ? error.message : "Could not save auction agreement.");
    } finally {
      setAgreeBusy(false);
    }
  }

  async function authorizeHelcim() {
    if (!lot.eventId) return;
    setPayBusy(true);
    setPayError(null);
    try {
      const response = await fetch("/api/auctions/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: lot.eventId, method: "helcim" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "The card window did not open. Try again.");
      if (json.needHelcim) {
        setPayOpen(false);
        setHelcimOpen(true);
        return;
      }
      setAuthorized(Boolean(json.authorized));
      setAuthStatus(String(json.authStatus || "approved"));
      setPayOpen(false);
      await refresh();
      await placeBid();
    } catch (error) {
      setPayError(error instanceof Error ? error.message : "Could not authorize card.");
    } finally {
      setPayBusy(false);
    }
  }

  async function authorizeCash() {
    if (!lot.eventId) return;
    setPayBusy(true);
    setPayError(null);
    try {
      const response = await fetch("/api/auctions/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: lot.eventId, method: "cash" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Cash pickup did not go to the desk. Try again.");
      setAuthorized(Boolean(json.authorized));
      setAuthStatus(String(json.authStatus || "pending"));
      setPayError(null);
      if (json.authorized) {
        setPayOpen(false);
        await refresh();
        await placeBid();
        return;
      }
      setMessage(
        "Cash-on-pickup is with the desk. Close this window to keep browsing — that does not cancel the request.",
      );
    } catch (error) {
      setPayError(error instanceof Error ? error.message : "Could not request cash approval.");
    } finally {
      setPayBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    pendingBid.current = {
      mode,
      amount: nextBid,
      maxAmount: Number(maxAmount),
    };
    await ensureBid();
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
        throw new Error(typeof json.error === "string" ? json.error : "We could not save pickup or shipping. Try again.");
      }
      setFulfillment(next);
      setMessage(next === "ship" ? "We will ship this lot." : "Marked for pickup.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not save pickup or shipping. Try again.");
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
            <p className="font-display text-sm tracking-[0.25em] text-brand-red">YOU BOUGHT THIS LOT</p>
            <p className="font-display text-3xl">Hammer {formatCurrency(currentBid)}</p>
            <p className="font-comic text-sm">
              {lot.saleSource === "buy_now" || lot.buyNowStatus === "sold"
                ? "Buy Now is due now. This lot is off the live floor and off Buy Now. Choose pickup or shipping, then pay today. Auction wins still wait for Sunday."
                : "This lot is reserved in your name. No payment is taken now. Choose ship or pick up here. Auction wins from this sale go on one Sunday invoice. Buy Now purchases are billed separately, right away."}
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
              {lot.saleSource === "buy_now" || lot.buyNowStatus === "sold"
                ? "Pay this invoice"
                : "View reserved lots"}
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
        ) : !open && !soldClosed ? (
          <div className="comic-panel space-y-3 p-5">
            <p className="font-display text-sm tracking-[0.25em] text-brand-red">VIEW ONLY</p>
            <p className="font-comic text-sm">
              This lot&apos;s clock has run out. It stays up to look at. A lot can be bid as soon as it
              hits the floor, including a sale that has not started, until the end time on that sale.
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
            Max Bid
          </button>
        </div>

        <p className="font-comic text-sm">
          {user ? (
            <>
              Paddle: <strong>{user.fullName}</strong> — guests can watch the tape;
              placing a bid uses this account. Terms, then a $50 Helcim hold or cash approval,
              are required for this auction before the bid is submitted.
            </>
          ) : (
            <>
              Watch the room free. <strong>Place Bid</strong> or{" "}
              <strong>Max Bid</strong> opens the paddle gate — log in first, then agree to
              this auction&apos;s terms, then a $50 Helcim hold or cash-on-pickup approval, before
              the bid is submitted.
            </>
          )}
        </p>

        {mode === "live" ? (
          <p className="font-comic text-sm">
            Next live paddle: <strong>{formatCurrency(nextBid)}</strong>
            {highBidder || highBidderId
              ? ` (+${formatCurrency(increment)})`
              : " (starting price)"}
            . Current step ${increment}.
            <span className="mt-1 block">Increments: {INCREMENT_TABLE_COPY}.</span>
          </p>
        ) : (
          <label className="block font-comic text-sm font-bold">
            Max Bid ($)
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
              We auto-increment against other paddles up to this ceiling ({INCREMENT_TABLE_COPY}).
              Current step is ${increment}. Your max stays hidden.
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
                : "Set Max Bid"}
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

      <BidAgreementModal
        open={agreeOpen}
        busy={agreeBusy}
        error={agreeError}
        terms={terms}
        onClose={() => setAgreeOpen(false)}
        onConfirm={() => void confirmAgreementAndBid()}
      />
      <BidPaymentModal
        open={payOpen}
        busy={payBusy}
        error={payError}
        pendingCash={authStatus === "pending"}
        testMode={/^(1|true|yes|on)$/i.test(
          process.env.NEXT_PUBLIC_PAYMENT_TEST_MODE || process.env.NEXT_PUBLIC_HELCIM_BYPASS || "",
        )}
        onClose={() => setPayOpen(false)}
        onHelcim={() => void authorizeHelcim()}
        onCash={() => void authorizeCash()}
      />
      <HelcimPayModal
        open={helcimOpen}
        purpose="bid_preauth"
        eventId={lot.eventId ?? undefined}
        onClose={() => {
          setHelcimOpen(false);
          setPayOpen(true);
        }}
        onComplete={async () => {
          setHelcimOpen(false);
          setAuthorized(true);
          setAuthStatus("approved");
          await refresh();
          await placeBid();
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
                {row.kind === "absentee" ? "max bid" : "live"}
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
