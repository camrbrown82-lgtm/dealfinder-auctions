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
  const [focusLotId, setFocusLotId] = useState<string | null>(null);
  const [holdShipPay, setHoldShipPay] = useState(false);
  const cashRequested = useRef(false);
  const openedPay = useRef(false);

  async function load() {
    const response = await fetch("/api/wins", { credentials: "include" });
    const json = await response.json();
    setWins(json.wins ?? []);
  }

  useEffect(() => {
    if (!user) return;
    setFocusLotId(new URLSearchParams(window.location.search).get("lot"));
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
    setHoldShipPay(fulfillment === "ship");
    await load();
    setNotice(
      fulfillment === "ship"
        ? "We will ship this lot. Confirm your address, then pay."
        : "Local pickup is set. Pay this invoice now.",
    );
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
    setHoldShipPay(false);
    await load();
    setNotice("Shipping address saved. Pay this invoice now.");
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
    if (!focusLotId || !wins.length) return;
    document.getElementById(`invoice-${focusLotId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusLotId, wins]);

  useEffect(() => {
    if (!focusLotId || openedPay.current) return;
    const match = wins.find((row) => row.lotId === focusLotId);
    if (!match || match.paid || match.payment === "cash_pending" || !match.invoiceReady || !match.winning) return;
    if (match.fulfillment === "unset") return;
    if (match.fulfillment === "ship" && (holdShipPay || !(match.address || "").trim())) return;
    openedPay.current = true;
    setPayLotId(match.lotId);
  }, [focusLotId, holdShipPay, wins]);

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
        <h1 className="font-display text-5xl text-brand-red">Your sold lots</h1>
        <p className="font-comic text-sm">
          Each card is a lot you won: the photo, lot number, and the price it sold for. The receipt
          in your email has the same lines and a download. Payment stays on this page after you
          choose pickup or shipping.
        </p>
        {notice && <p className="mt-3 font-display text-xl">{notice}</p>}
      </div>

      {wins.length === 0 ? (
        <p className="font-comic">
          No sold lots on your paddle yet.{" "}
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
          {[...wins]
            .sort((a, b) => Number(b.lotId === focusLotId) - Number(a.lotId === focusLotId))
            .map((win) => {
              const dueNow = win.lotId === focusLotId && win.invoiceReady && !win.paid;
              return (
                <div key={win.lotId} className="space-y-3">
                  {dueNow ? (
                    <div className="comic-panel border-brand-red bg-brand-cream p-4">
                      <p className="font-display text-3xl text-brand-red">Pay this Buy Now now</p>
                      <p className="mt-1 font-comic text-sm">
                        {win.fulfillment === "unset"
                          ? "Choose local pickup or shipping below. Payment opens as soon as that choice is saved."
                          : win.fulfillment === "ship" && (holdShipPay || !(win.address || "").trim())
                            ? "Confirm the shipping address. Payment opens after you save it."
                            : "Pickup or shipping is set. Helcim is opening so you can pay this invoice now."}
                      </p>
                    </div>
                  ) : null}
                  <InvoicePanel
                    win={win}
                    busy={busy === win.lotId}
                    emphasized={dueNow}
                    onFulfillment={(lotId, fulfillment) => void chooseFulfillment(lotId, fulfillment)}
                    onPay={(lotId) => setPayLotId(lotId)}
                    onCash={(lotId) => void requestCash(lotId)}
                    onAddress={(lotId, address) => void saveAddress(lotId, address)}
                  />
                </div>
              );
            })}
        </div>
      )}

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
      </div>

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
