"use client";

import { useEffect, useState } from "react";
import {
  CONSIGNMENT_AGREEMENT_INTRO,
  CONSIGNMENT_AGREEMENT_SECTIONS,
  CONSIGNMENT_AGREEMENT_TITLE,
} from "@/lib/consignmentAgreement";

export function ConsignmentTermsModal({
  open,
  consignorName,
  busy,
  error,
  onClose,
  onAccept,
}: {
  open: boolean;
  consignorName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAccept: () => void;
}) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (open) setAccepted(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const today = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consignment-terms-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden comic-panel"
      >
        <div className="shrink-0 border-b-4 border-black bg-brand-cream px-4 py-3">
          <p className="font-display text-sm tracking-[0.25em] text-brand-red">REQUIRED</p>
          <h2 id="consignment-terms-title" className="font-display text-3xl leading-none text-brand-red sm:text-4xl">
            {CONSIGNMENT_AGREEMENT_TITLE}
          </h2>
          <p className="mt-2 font-comic text-sm">
            {consignorName ? (
              <>
                Consignor: <strong>{consignorName}</strong> · {today}
              </>
            ) : (
              today
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 font-comic text-sm leading-relaxed">
          <p className="mb-4">{CONSIGNMENT_AGREEMENT_INTRO}</p>
          {CONSIGNMENT_AGREEMENT_SECTIONS.map((section) => (
            <section key={section.heading} className="mb-4">
              <h3 className="font-display text-xl text-brand-red">{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-1">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="shrink-0 space-y-3 border-t-4 border-black bg-brand-cream p-4">
          {error && (
            <p className="border-4 border-black bg-brand-red p-2 font-comic text-sm text-white">{error}</p>
          )}
          <label className="flex items-start gap-3 font-comic text-sm font-bold">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={busy}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span>
              I have read and agree to the DealFinder Auctions Inc. Consignment Agreement,
              including the statutory declaration.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="comic-btn"
              disabled={!accepted || busy}
              onClick={onAccept}
            >
              {busy ? "Submitting…" : "Accept and submit"}
            </button>
            <button
              type="button"
              className="comic-btn-invert"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
