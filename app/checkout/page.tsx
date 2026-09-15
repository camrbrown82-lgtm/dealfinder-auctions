"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBidder } from "@/components/BidderProvider";
import { InvoicePanel } from "@/components/InvoicePanel";
import { INTERAC_EMAIL, PICKUP_INSTRUCTIONS, paymentMethodLabel } from "@/lib/payments";
import type { FulfillmentChoice } from "@/lib/payments";
import { profileAddress } from "@/lib/profileTypes";
import type { PaymentMethod } from "@/lib/profileTypes";
import type { WinInvoice } from "@/lib/winTypes";

export default function CheckoutPage() {
  const { user, ready, refresh, requestAuth } = useBidder();
  const [wins, setWins] = useState<WinInvoice[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("interac_etransfer");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/wins", { credentials: "include" });
    const json = await response.json();
    setWins(json.wins ?? []);
  }

  useEffect(() => {
    if (!user) return;
    setMethod(user.paymentMethod);
    void load();
  }, [user]);

  async function chooseMethod(next: PaymentMethod) {
    setMethod(next);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: user?.fullName,
        phone: user?.phone,
        street: user?.street,
        city: user?.city,
        province: user?.province,
        postalCode: user?.postalCode,
        paymentMethod: next,
      }),
    });
    if (response.ok) {
      await refresh();
      await load();
      setNotice(`Payment set to ${paymentMethodLabel(next)}.`);
    }
  }

  async function chooseFulfillment(lotId: string, fulfillment: FulfillmentChoice) {
    setBusy(lotId);
    setNotice(null);
    const response = await fetch("/api/wins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotId, fulfillment }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setNotice(typeof json.error === "string" ? json.error : "Could not save ship or pickup.");
      return;
    }
    await load();
    setNotice(fulfillment === "ship" ? "We will ship this lot." : "This lot is marked for pickup.");
  }

  if (!ready) return <p className="font-comic">Loading invoices…</p>;

  if (!user) {
    return (
      <div className="comic-panel p-6">
        <h1 className="font-display text-5xl text-[#FF0000]">Checkout</h1>
        <p className="mt-2 font-comic">Log in to see invoices for lots you are winning.</p>
        <button
          type="button"
          className="comic-btn mt-4"
          onClick={() => requestAuth(undefined, "login")}
        >
          Log In
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="comic-panel p-4">
        <h1 className="font-display text-5xl text-brand-red">Winning checkout</h1>
        <p className="font-comic text-sm">
          Payment is Interac or pay on arrival. After each hammer, pick ship or pick up on that
          invoice — it is not set at signup.
        </p>
      </div>

      <div className="comic-panel p-5">
        <p className="font-display text-2xl">Preferred payment method</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={
              method === "interac_etransfer" ? "comic-btn" : "comic-btn-invert"
            }
            onClick={() => void chooseMethod("interac_etransfer")}
          >
            Interac e-Transfer
          </button>
          <button
            type="button"
            className={method === "pay_on_arrival" ? "comic-btn" : "comic-btn-invert"}
            onClick={() => void chooseMethod("pay_on_arrival")}
          >
            Pay on Arrival
          </button>
        </div>
        <div className="mt-4 space-y-2 font-comic text-sm">
          <p className="border-4 border-black bg-white px-3 py-2">
            Interac recipient email: <strong>{INTERAC_EMAIL}</strong>
          </p>
          {user && profileAddress(user) ? (
            <p className="border-4 border-black bg-white px-3 py-2">
              Address on your paddle: <strong>{profileAddress(user)}</strong>
            </p>
          ) : (
            <p className="border-4 border-black bg-white px-3 py-2">
              Add a street address on your bidder card if you want a lot shipped.
            </p>
          )}
          <p className="border-4 border-black bg-white px-3 py-2">{PICKUP_INSTRUCTIONS}</p>
        </div>
        {notice && <p className="mt-3 font-display text-xl">{notice}</p>}
      </div>

      {wins.length === 0 ? (
        <p className="font-comic">
          No hammers on your paddle yet.{" "}
          <Link href="/live" className="font-bold underline">
            Browse live lots
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {wins.map((win) => (
            <InvoicePanel
              key={win.lotId}
              win={win}
              busy={busy === win.lotId}
              onFulfillment={(lotId, fulfillment) => void chooseFulfillment(lotId, fulfillment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
