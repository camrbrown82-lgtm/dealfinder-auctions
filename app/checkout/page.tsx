"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBidder } from "@/components/BidderProvider";
import { InvoicePanel } from "@/components/InvoicePanel";
import { HelcimPayModal } from "@/components/HelcimPayModal";
import { PreauthDisclaimer } from "@/components/PreauthDisclaimer";
import { PICKUP_INSTRUCTIONS } from "@/lib/payments";
import type { FulfillmentChoice } from "@/lib/payments";
import { profileAddress } from "@/lib/profileTypes";
import type { WinInvoice } from "@/lib/winTypes";
import { formatCurrency } from "@/lib/utils";

export default function CheckoutPage() {
  const { user, ready, refresh, requestAuth } = useBidder();
  const [wins, setWins] = useState<WinInvoice[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payLotId, setPayLotId] = useState<string | null>(null);
  const cashRequested = useRef(false);

  async function load() {
    const response = await fetch("/api/wins", { credentials: "include" });
    const json = await response.json();
    setWins(json.wins ?? []);
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

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
    setNotice(fulfillment === "ship" ? "We will ship this lot. Confirm your address below." : "This lot is marked for local pickup.");
  }

  async function saveAddress(
    lotId: string,
    address: {
      fullName: string;
      street: string;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
    },
  ) {
    setBusy(lotId);
    setNotice(null);
    const response = await fetch("/api/wins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotId, fulfillment: "ship", address }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setNotice(typeof json.error === "string" ? json.error : "Could not save shipping address.");
      return;
    }
    await load();
    setNotice("Shipping address saved. Estimated postage is on the invoice.");
  }

  async function requestCash(lotId: string) {
    setBusy(lotId);
    setNotice(null);
    const response = await fetch("/api/wins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotId, cash: true }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setNotice(typeof json.error === "string" ? json.error : "Could not request cash payment.");
      return;
    }
    await load();
    setNotice("Cash payment is pending desk approval.");
  }

  useEffect(() => {
    if (!user || !wins.length) return;
    const params = new URLSearchParams(window.location.search);
    const lot = params.get("lot");
    const cash = params.get("cash");
    if (lot && cash === "1" && !cashRequested.current) {
      const match = wins.find((row) => row.lotId === lot);
      if (match && match.payment !== "cash_pending" && !match.paid) {
        cashRequested.current = true;
        void requestCash(lot);
      }
    }
  }, [user, wins]);

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

  const holdLabel =
    user.preauthStatus === "held"
      ? `${formatCurrency(user.preauthAmount)} Sunday Helcim hold is sitting on your card until a sale is paid.`
      : user.preauthStatus === "released"
        ? "The $50 Sunday hold has been released back to your card."
        : user.preauthStatus === "denied"
          ? "Sunday's $50 hold was denied. Bids on that sale were forfeited."
          : "The $50 hold is placed on Sunday, the day the auction ends — not when you bid.";

  return (
    <div className="space-y-4">
      <div className="comic-panel p-4">
        <h1 className="font-display text-5xl text-brand-red">Winning checkout</h1>
        <p className="font-comic text-sm">
          Auction hammers settle after Sunday&apos;s consolidated invoice. Buy Now purchases can
          be paid immediately. After each claim, pick local pickup or shipping. Pickup is hammer
          + 15% premium + GST. Shipping adds a $10 handling fee, estimated carrier postage, and GST.
        </p>
      </div>

      <div className="comic-panel space-y-3 p-5">
        <p className="font-display text-2xl">Helcim card</p>
        <PreauthDisclaimer />
        <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          {holdLabel}
        </p>
        {user && profileAddress(user) ? (
          <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
            Address on your paddle: <strong>{profileAddress(user)}</strong>
          </p>
        ) : (
          <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
            Add a street address on your bidder card if you want a lot shipped.
          </p>
        )}
        <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">{PICKUP_INSTRUCTIONS}</p>
        {notice && <p className="font-display text-xl">{notice}</p>}
      </div>

      {wins.length === 0 ? (
        <p className="font-comic">
          No hammers on your paddle yet.{" "}
          <Link href="/buy-now" className="font-bold underline">
            Browse Buy Now
          </Link>{" "}
          or{" "}
          <Link href="/live" className="font-bold underline">
            live lots
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
              onPay={(lotId) => setPayLotId(lotId)}
              onCash={(lotId) => void requestCash(lotId)}
              onAddress={(lotId, address) => void saveAddress(lotId, address)}
            />
          ))}
        </div>
      )}

      <HelcimPayModal
        open={Boolean(payLotId)}
        purpose="checkout_purchase"
        lotId={payLotId ?? undefined}
        onClose={() => setPayLotId(null)}
        onComplete={(result) => {
          setPayLotId(null);
          void refresh();
          void load();
          setNotice(
            result.warning ||
              (result.preauthReleased
                ? "Hammer paid with Helcim. The $50 Sunday hold was sent back to your card."
                : "Hammer paid with Helcim."),
          );
        }}
        onDeclined={() => {
          const lotId = payLotId;
          setPayLotId(null);
          if (!lotId) return;
          void fetch("/api/payments/helcim/denied", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lotId, scope: "lot" }),
          }).then(() => {
            void load();
            setNotice("Checkout was denied. That bid is forfeited.");
          });
        }}
      />
    </div>
  );
}
