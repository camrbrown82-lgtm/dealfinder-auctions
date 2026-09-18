"use client";

import { BID_PREAUTH_AMOUNT, PREAUTH_DISCLAIMER } from "@/lib/helcimCopy";
import { formatCurrency } from "@/lib/utils";

export function BidPaymentModal({
  open,
  busy,
  error,
  pendingCash,
  testMode,
  onClose,
  onHelcim,
  onCash,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  pendingCash: boolean;
  testMode: boolean;
  onClose: () => void;
  onHelcim: () => void;
  onCash: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-auth-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto comic-panel"
      >
        <div className="sticky top-0 z-10 border-b-4 border-black bg-brand-cream px-4 py-3">
          <p className="font-display text-sm tracking-[0.3em] text-brand-red">BEFORE YOU BID</p>
          <h2 id="bid-auth-title" className="font-display text-4xl leading-none text-brand-red">
            Authorize this paddle
          </h2>
        </div>
        <div className="space-y-3 p-4 font-comic text-sm">
          <p>
            You must authorize a {formatCurrency(BID_PREAUTH_AMOUNT)} Helcim card hold, or request
            cash-on-pickup, before a bid can be submitted.
          </p>
          <p className="border-4 border-black bg-white px-3 py-2">{PREAUTH_DISCLAIMER}</p>
          {pendingCash ? (
            <p className="border-4 border-black bg-brand-cream px-3 py-2 font-bold">
              Cash pickup is waiting on desk approval. You cannot bid until staff approve this
              auction (or mark you as a trusted cash bidder).
            </p>
          ) : null}
          {error ? (
            <p className="border-4 border-black bg-brand-red p-2 font-bold text-white">{error}</p>
          ) : null}
          {testMode ? (
            <p className="border-4 border-black bg-white px-3 py-2">
              Payment test mode is on. Approving the {formatCurrency(BID_PREAUTH_AMOUNT)} hold marks
              you authorized without charging a card. When Helcim sandbox is connected and test mode
              is off, this same button opens real HelcimPay.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <button type="button" className="comic-btn" disabled={busy || pendingCash} onClick={onHelcim}>
              {busy ? "Working…" : `Authorize ${formatCurrency(BID_PREAUTH_AMOUNT)} card hold`}
            </button>
            <button type="button" className="comic-btn-invert" disabled={busy || pendingCash} onClick={onCash}>
              Request cash on pickup
            </button>
            <button type="button" className="comic-btn-invert" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
