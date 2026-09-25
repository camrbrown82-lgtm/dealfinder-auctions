"use client";

import { useEffect, useState } from "react";
import type { AuctionTermsPack } from "@/lib/auctionTerms";
import { formatCurrency } from "@/lib/utils";
import { BID_PREAUTH_AMOUNT } from "@/lib/helcimCopy";

export function BidAgreementModal({
  open,
  busy,
  error,
  terms,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  terms: AuctionTermsPack | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [preauthAgreed, setPreauthAgreed] = useState(false);

  useEffect(() => {
    if (open) {
      setTermsAgreed(false);
      setPreauthAgreed(false);
    }
  }, [open, terms?.auctionNumber]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !terms) return null;
  const ready = termsAgreed && preauthAgreed && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-terms-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden comic-panel"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-4 border-black bg-brand-cream px-4 py-3">
          <div>
            <p className="font-display text-sm tracking-[0.25em] text-brand-red">BEFORE YOU BID</p>
            <h2 id="bid-terms-title" className="font-display text-3xl leading-none text-brand-red sm:text-4xl">
              {terms.title}
            </h2>
            <p className="mt-2 font-comic text-sm">{terms.intro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="comic-btn-invert shrink-0 !px-3 !py-1 !text-3xl leading-none"
            aria-label="Back to the bidding floor"
          >
            X
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 font-comic text-sm leading-relaxed">
          <pre className="whitespace-pre-wrap font-comic text-sm leading-relaxed">{terms.termsText}</pre>
          <p className="mt-4 border-4 border-black bg-brand-cream p-3 font-comic text-sm font-bold">
            15% buyer&apos;s premium + 5% GST apply to every winning invoice. Shipped orders add a $10
            handling fee (itemized) plus actual carrier postage from weight/dimensions.
          </p>
        </div>

        <div className="shrink-0 space-y-3 border-t-4 border-black bg-brand-cream p-4">
          {error ? (
            <p className="border-4 border-black bg-brand-red p-2 font-comic text-sm text-white">{error}</p>
          ) : null}
          <label className="flex items-start gap-3 font-comic text-sm font-bold">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              disabled={busy}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span>{terms.termsCheckbox}</span>
          </label>
          <label className="flex items-start gap-3 font-comic text-sm font-bold">
            <input
              type="checkbox"
              checked={preauthAgreed}
              onChange={(e) => setPreauthAgreed(e.target.checked)}
              disabled={busy}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span>I understand bidding requires a $50 Helcim card hold or cash-on-pickup approval.</span>
          </label>
          <p className="font-comic text-xs">
            Confirming saves this auction&apos;s terms. Next you authorize a{" "}
            {formatCurrency(BID_PREAUTH_AMOUNT)} Helcim hold or request cash pickup. The hammer is
            not charged until checkout.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="comic-btn" disabled={!ready} onClick={onConfirm}>
              {busy ? "Saving…" : "Agree and continue"}
            </button>
            <button type="button" className="comic-btn-invert" disabled={busy} onClick={onClose}>
              Back to the floor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
