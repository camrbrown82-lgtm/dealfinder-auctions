"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { countdown, isLive, lotImages, money, profileComplete } from "@/lib/catalog";
import type { Bid, BidKind, Lot } from "@/lib/types";
import { useBidder } from "./bidder-provider";
import { LotGallery } from "./lot-gallery";

export function AuctionRoom({ lot }: { lot: Lot }) {
  const { user, requestAuth } = useBidder();
  const [currentBid, setCurrentBid] = useState(lot.currentBid);
  const [endsAt, setEndsAt] = useState(lot.endsAt);
  const [highBidder, setHighBidder] = useState(lot.highBidder);
  const [status] = useState(lot.status);
  const [extended, setExtended] = useState(false);
  const [mode, setMode] = useState<BidKind>("live");
  const [maxAmount, setMaxAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tape, setTape] = useState<Bid[]>([]);
  const pending = useRef<{ mode: BidKind; amount: number; maxAmount: number } | null>(null);
  const nextLive = useMemo(() => currentBid + lot.minIncrement, [currentBid, lot.minIncrement]);
  const open = isLive({ endsAt, status }, now);
  const youAreHigh = Boolean(user && highBidder && user.fullName === highBidder);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`/api/bids?lotId=${encodeURIComponent(lot.id)}`)
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json.bids)) setTape(json.bids);
      })
      .catch(() => undefined);
  }, [lot.id]);

  async function fire() {
    if (!open) return;
    const payload = pending.current ?? { mode, amount: nextLive, maxAmount: Number(maxAmount) };
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: lot.id, mode: payload.mode, amount: payload.amount, maxAmount: payload.maxAmount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bid failed");
      setCurrentBid(json.currentBid);
      setEndsAt(json.endsAt);
      setHighBidder(json.highBidder);
      setExtended(Boolean(json.extended));
      if (Array.isArray(json.events)) setTape((prev) => [...json.events, ...prev].slice(0, 12));
      setNotice(
        json.extended
          ? `Bid in. Clock extended +2:00 (anti-snipe). High ${money(json.currentBid)}`
          : `High bid is now ${money(json.currentBid)}`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Bid failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!open) return;
    pending.current = { mode, amount: nextLive, maxAmount: Number(maxAmount) };
    if (!user || !profileComplete(user)) {
      requestAuth(() => fire(), "signup");
      return;
    }
    await fire();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <div className="space-y-4">
        <Link href="/live" className="font-comic text-sm font-bold underline">
          ← Back to live lots
        </Link>
        <div className="comic-panel overflow-hidden bg-white">
          <LotGallery images={lotImages(lot)} alt={lot.title} variant="hero" sizes="(max-width: 1024px) 100vw, 50vw" />
        </div>
      </div>
      <div className="space-y-4">
        <p className="font-display text-2xl uppercase text-brand-red">{lot.category}</p>
        <p className="font-comic text-sm font-bold">
          Auction {lot.auctionNumber} · Lot {lot.lotNumber}
        </p>
        <h1 className="font-display text-5xl uppercase leading-none sm:text-6xl">{lot.title}</h1>
        <p className="font-comic text-lg font-bold">{lot.description}</p>
        <p className="font-comic text-sm">
          Consigned by <strong>{lot.consignor}</strong>
        </p>
        <div className="comic-panel bg-white p-4">
          <p className="font-display text-xl tracking-widest text-brand-red">LIVE HAMMER</p>
          <p className="font-display text-6xl text-brand-red">{money(currentBid)}</p>
          <p className="mt-2 font-comic text-sm font-bold">
            {youAreHigh ? "YOU ARE HIGH PADDLE" : highBidder ? `High paddle · ${highBidder}` : "No bids yet — open the floor"}
          </p>
          <p className="mt-2 font-display text-4xl">{countdown(endsAt, now)}</p>
          {extended && <p className="mt-1 font-comic text-xs font-bold">Anti-snipe clock is live.</p>}
        </div>
        <form onSubmit={onSubmit} className="comic-panel space-y-3 bg-white p-4">
          <div className="flex gap-2">
            <button type="button" className={mode === "live" ? "comic-btn !text-lg" : "comic-btn-invert !text-lg"} onClick={() => setMode("live")}>
              Live bid
            </button>
            <button type="button" className={mode === "absentee" ? "comic-btn !text-lg" : "comic-btn-invert !text-lg"} onClick={() => setMode("absentee")}>
              Absentee max
            </button>
          </div>
          <p className="font-comic text-sm font-bold">Watch the room free.</p>
          {mode === "absentee" && (
            <label className="block font-comic text-sm font-bold">
              Max absentee
              <input
                type="number"
                min={nextLive}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="mt-1 w-full border-4 border-black px-3 py-2"
              />
            </label>
          )}
          {open ? (
            <>
              <button type="submit" className="comic-btn w-full !text-3xl" disabled={busy}>
                {busy ? "Working…" : mode === "live" ? `Place Bid ${money(nextLive)}` : "Set Absentee Bid"}
              </button>
              <p className="font-comic text-xs font-bold">
                Place Bid or Set Absentee Bid opens the paddle gate — we keep your amount and submit it after you log in.
              </p>
              <p className="font-comic text-sm font-bold">
                Next live paddle: {money(nextLive)} (+ {money(lot.minIncrement)})
              </p>
            </>
          ) : (
            <p className="font-display text-3xl text-brand-red">Bidding closed</p>
          )}
          {notice && <p className="border-4 border-black bg-[#FFF7D1] px-3 py-2 font-comic text-sm font-bold">{notice}</p>}
        </form>
        <div className="comic-panel bg-white p-4">
          <h2 className="font-display text-3xl">Bid tape</h2>
          {tape.length === 0 ? (
            <p className="mt-2 font-comic text-sm font-bold">Waiting for the first paddle…</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {tape.slice(0, 12).map((bid) => (
                <li key={bid.id} className="flex items-center justify-between border-b-2 border-black pb-1 font-comic text-sm font-bold">
                  <span>
                    {bid.bidder} · {bid.kind}
                  </span>
                  <span>{money(bid.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
