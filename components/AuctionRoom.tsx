"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useBidder } from "@/components/BidderProvider";
import { LotTimer } from "@/components/LotTimer";
import { nextLiveAmount } from "@/lib/bidding";
import { isProfileComplete } from "@/lib/profileTypes";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  formatCurrency,
  isLotOpen,
  type AuctionLot,
} from "@/lib/utils";

type BidRow = {
  bidder: string;
  amount: number;
  kind: "live" | "absentee";
};

export function AuctionRoom({ lot }: { lot: AuctionLot }) {
  const { user, requestAuth } = useBidder();
  const [currentBid, setCurrentBid] = useState(lot.currentBid);
  const [endsAt, setEndsAt] = useState(lot.endsAt);
  const [highBidder, setHighBidder] = useState(lot.highBidder ?? null);
  const [status, setStatus] = useState(lot.status ?? "live");
  const [extended, setExtended] = useState(false);
  const [mode, setMode] = useState<"live" | "absentee">("live");
  const [maxAmount, setMaxAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [feed, setFeed] = useState<BidRow[]>([]);
  const pendingBid = useRef<{
    mode: "live" | "absentee";
    amount: number;
    maxAmount: number;
  } | null>(null);

  const nextBid = useMemo(
    () => nextLiveAmount(currentBid, lot.minIncrement),
    [currentBid, lot.minIncrement],
  );
  const open = isLotOpen({ endsAt, status }, now);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void fetch(`/api/bids?lotId=${encodeURIComponent(lot.id)}`)
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json.bids)) setFeed(json.bids);
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
            status?: AuctionLot["status"];
          };
          if (next.current_bid != null) setCurrentBid(Number(next.current_bid));
          if (next.ends_at) {
            setEndsAt((prev) => {
              if (new Date(next.ends_at!).getTime() > new Date(prev).getTime()) {
                setExtended(true);
              }
              return next.ends_at!;
            });
          }
          if (next.high_bidder !== undefined) setHighBidder(next.high_bidder);
          if (next.status) setStatus(next.status);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lot.id]);

  async function placeBid() {
    if (!open) return;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId: lot.id,
          mode: intent.mode,
          amount: intent.amount,
          maxAmount: intent.maxAmount,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Bid failed");

      setCurrentBid(json.currentBid);
      setEndsAt(json.endsAt);
      setHighBidder(json.highBidder);
      setExtended(Boolean(json.extended));
      if (Array.isArray(json.events)) {
        setFeed((current) => [...json.events.slice().reverse(), ...current].slice(0, 12));
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!open) return;
    pendingBid.current = {
      mode,
      amount: nextBid,
      maxAmount: Number(maxAmount),
    };
    if (!user || !isProfileComplete(user)) {
      requestAuth(() => placeBid(), "signup");
      return;
    }
    await placeBid();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 border-4 border-black bg-[#FF0000] p-4 text-white sm:flex-row sm:items-center">
        <div>
          <p className="font-display text-sm tracking-[0.25em]">LIVE HAMMER</p>
          <p className="font-display text-4xl">{formatCurrency(currentBid)}</p>
          <p className="font-comic text-sm">
            {highBidder ? `High bidder: ${highBidder}` : "No bids yet — open the floor"}
          </p>
        </div>
        <LotTimer endsAt={endsAt} extended={extended} />
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 border-4 border-black bg-[#FFF7D1] p-5 shadow-[6px_6px_0_0_#000]"
      >
        <div className="flex gap-2">
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

        <p className="font-comic text-sm">
          {user ? (
            <>
              Paddle: <strong>{user.fullName}</strong> — guests can watch the tape;
              placing a bid uses this account.
            </>
          ) : (
            <>
              Watch the room free. <strong>Place Bid</strong> or{" "}
              <strong>Set Absentee Bid</strong> opens the paddle gate — we keep your
              amount and submit it after you log in.
            </>
          )}
        </p>

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

        <button type="submit" className="comic-btn w-full" disabled={busy || !open}>
          {!open
            ? "Bidding closed"
            : busy
              ? "Placing…"
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

      <div className="border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000]">
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
    </div>
  );
}
