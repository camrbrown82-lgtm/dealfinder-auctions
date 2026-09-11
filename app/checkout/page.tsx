"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBidder } from "@/components/bidder-provider";
import { INTERAC_EMAIL, PICKUP_INSTRUCTIONS, money, paymentLabel } from "@/lib/catalog";

type Win = {
  lotId: string;
  slug: string;
  title: string;
  currentBid: number;
  winning: boolean;
  invoice: string;
  paymentMethod: string;
  paymentMethodKey: string;
  instructions: string;
};

export default function CheckoutPage() {
  const { user, ready, refresh, requestAuth } = useBidder();
  const [wins, setWins] = useState<Win[]>([]);
  const [method, setMethod] = useState("interac_etransfer");
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/wins");
    const json = await res.json();
    setWins(json.wins ?? []);
  }

  useEffect(() => {
    if (user) {
      setMethod(user.paymentMethod);
      void load();
    }
  }, [user]);

  async function setPayment(next: "interac_etransfer" | "pay_on_arrival") {
    setMethod(next);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: next }),
    });
    if (res.ok) {
      await refresh();
      setNotice(`Payment set to ${paymentLabel(next)}`);
      void load();
    }
  }

  if (!ready) return <p className="font-display text-4xl">Loading invoices…</p>;
  if (!user) {
    return (
      <div className="comic-panel max-w-lg space-y-4 p-6">
        <h1 className="font-display text-5xl">Winning checkout</h1>
        <p className="font-comic font-bold">Log in to see invoices for lots you are winning.</p>
        <button type="button" className="comic-btn" onClick={() => requestAuth(undefined, "login")}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-6xl">Winning checkout</h1>
        <p className="font-comic font-bold">No Stripe. Settle by Interac e-Transfer or pay on arrival.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={method === "interac_etransfer" ? "comic-btn" : "comic-btn-invert"} onClick={() => void setPayment("interac_etransfer")}>
          Interac e-Transfer
        </button>
        <button type="button" className={method === "pay_on_arrival" ? "comic-btn" : "comic-btn-invert"} onClick={() => void setPayment("pay_on_arrival")}>
          Pay on Arrival
        </button>
      </div>
      {method === "interac_etransfer" && (
        <p className="font-comic text-sm font-bold">
          Send to <span className="underline">{INTERAC_EMAIL}</span>. Put the invoice number in the memo.
        </p>
      )}
      {method === "pay_on_arrival" && <p className="font-comic text-sm font-bold">{PICKUP_INSTRUCTIONS}</p>}
      {notice && <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">{notice}</p>}
      {wins.length === 0 ? (
        <div className="comic-panel p-6">
          <p className="font-display text-4xl">No hammers on your paddle yet.</p>
          <Link href="/live" className="comic-btn mt-4 inline-flex">
            Browse live lots
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {wins.map((win) => (
            <article key={win.lotId} className="comic-panel bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {win.winning && <p className="font-display text-xl text-brand-red">HAMMERED — INVOICE</p>}
                  <h2 className="font-display text-4xl uppercase">{win.title}</h2>
                </div>
                <p className="font-display text-4xl text-brand-red">{money(win.currentBid)}</p>
              </div>
              <p className="mt-2 font-comic text-sm font-bold">
                {win.invoice} · {paymentLabel(win.paymentMethodKey)}
              </p>
              <p className="mt-2 font-comic text-sm">{win.instructions}</p>
              <Link href={`/auctions/${win.slug || win.lotId}`} className="mt-3 inline-block font-comic text-sm font-bold underline">
                Open lot
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
