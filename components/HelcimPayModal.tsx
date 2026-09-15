"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  PREAUTH_DISCLAIMER,
  PREAUTH_DISCLAIMER_TITLE,
} from "@/lib/helcimCopy";

export type HelcimPurpose = "bid_preauth" | "checkout_purchase";

function destroyHelcimIframe() {
  if (typeof window.removeHelcimPayIframe === "function") {
    try {
      window.removeHelcimPayIframe();
    } catch {
      // fall through to DOM cleanup
    }
  }
  document.getElementById("helcimPayIframe")?.remove();
  document.querySelectorAll("iframe").forEach((frame) => {
    if (frame.id === "helcimPayIframe" || /helcim/i.test(frame.src)) {
      frame.remove();
    }
  });
}

function loadHelcimScript() {
  const src =
    process.env.NEXT_PUBLIC_HELCIM_PAY_JS ||
    "https://secure.helcim.app/helcim-pay/services/start.js";
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("HelcimPay.js failed to load.")), {
            once: true,
          });
        });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("HelcimPay.js failed to load."));
    document.head.appendChild(script);
  });
}

export function HelcimPayModal({
  open,
  purpose,
  lotId,
  onClose,
  onComplete,
  onDeclined,
}: {
  open: boolean;
  purpose: HelcimPurpose;
  lotId?: string;
  onClose: () => void;
  onComplete: (result: { demo: boolean; preauthReleased?: boolean; warning?: string }) => void;
  onDeclined?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [session, setSession] = useState<{
    checkoutToken: string;
    amount: number;
    currency: string;
    demo: boolean;
  } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onDeclinedRef = useRef(onDeclined);
  onDeclinedRef.current = onDeclined;

  useEffect(() => {
    if (!open) {
      setSession(null);
      setMessage(null);
      setBusy(false);
      destroyHelcimIframe();
      return;
    }
    let cancelled = false;
    setBusy(true);
    setMessage(null);
    void (async () => {
      try {
        const response = await fetch("/api/payments/helcim/session", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose, lotId }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not start Helcim.");
        if (cancelled) return;
        if (json.alreadyHeld) {
          onCompleteRef.current({ demo: Boolean(json.demo) });
          return;
        }
        setSession({
          checkoutToken: json.checkoutToken,
          amount: Number(json.amount),
          currency: String(json.currency || "CAD"),
          demo: Boolean(json.demo),
        });
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not start Helcim.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, purpose, lotId]);

  async function confirm(eventMessage?: unknown, demo = false) {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/payments/helcim/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutToken: session.checkoutToken,
          eventMessage,
          demo,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Helcim could not confirm this payment.");
      destroyHelcimIframe();
      onCompleteRef.current({
        demo: Boolean(json.demo),
        preauthReleased: Boolean(json.preauthReleased),
        warning: typeof json.warning === "string" ? json.warning : undefined,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Helcim could not confirm this payment.");
    } finally {
      setBusy(false);
    }
  }

  async function openHelcim() {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      await loadHelcimScript();
      if (typeof window.appendHelcimPayIframe !== "function") {
        throw new Error("HelcimPay.js is not available in this browser.");
      }
      const token = session.checkoutToken;
      const onMessage = (event: MessageEvent) => {
        const key = `helcim-pay-js-${token}`;
        if (!event.data || event.data.eventName !== key) return;
        if (event.data.eventStatus === "SUCCESS") {
          window.removeEventListener("message", onMessage);
          void confirm(event.data.eventMessage, false);
        } else if (event.data.eventStatus === "ABORTED") {
          window.removeEventListener("message", onMessage);
          destroyHelcimIframe();
          setBusy(false);
          setMessage(String(event.data.eventMessage || "Card was declined."));
          onDeclinedRef.current?.();
        } else if (event.data.eventStatus === "HIDE") {
          window.removeEventListener("message", onMessage);
          destroyHelcimIframe();
          setBusy(false);
        }
      };
      window.addEventListener("message", onMessage);
      window.appendHelcimPayIframe(token, true);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not open HelcimPay.");
    }
  }

  if (!open) return null;

  const heading =
    purpose === "bid_preauth" ? "Sunday $50 pre-authorization" : "Pay this hammer with Helcim";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="helcim-pay-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto comic-panel"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b-4 border-black bg-brand-cream px-4 py-3">
          <div>
            <p className="font-display text-sm tracking-[0.3em] text-brand-red">HELCIM</p>
            <h2 id="helcim-pay-title" className="font-display text-4xl leading-none text-brand-red">
              {heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              destroyHelcimIframe();
              onClose();
            }}
            className="comic-btn-invert shrink-0 !px-3 !py-1 !text-3xl leading-none"
            aria-label="Close Helcim checkout"
          >
            X
          </button>
        </div>
        <div className="space-y-3 p-4">
          {purpose === "bid_preauth" ? (
            <div className="border-4 border-black bg-white px-3 py-2">
              <p className="font-display text-xl">{PREAUTH_DISCLAIMER_TITLE}</p>
              <p className="mt-1 font-comic text-sm">{PREAUTH_DISCLAIMER}</p>
              <p className="mt-2 font-comic text-sm font-bold">
                If this Sunday hold is denied, your bids on this sale are forfeited.
              </p>
            </div>
          ) : (
            <p className="font-comic text-sm">
              Helcim charges the hammer now. The $50 Sunday hold is reversed as soon as this sale
              goes through. If this payment is denied, the bid is forfeited.
            </p>
          )}
          {session ? (
            <p className="font-display text-3xl text-brand-red">
              {formatCurrency(session.amount)} {session.currency}
            </p>
          ) : null}
          {session?.demo ? (
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
              Helcim sandbox keys are not on this machine yet, so this is a local test approval.
              Paste <code>HELCIM_API_TOKEN</code> into <code>.env.local</code> (and Vercel) to open
              the real HelcimPay.js modal.
            </p>
          ) : null}
          {message ? (
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {session?.demo ? (
              <button
                type="button"
                className="comic-btn"
                disabled={busy || !session}
                onClick={() => void confirm(undefined, true)}
              >
                {busy ? "Working…" : purpose === "bid_preauth" ? "Test-approve Sunday $50 hold" : "Test-pay hammer"}
              </button>
            ) : (
              <button
                type="button"
                className="comic-btn"
                disabled={busy || !session}
                onClick={() => void openHelcim()}
              >
                {busy ? "Working…" : "Open Helcim"}
              </button>
            )}
            {session?.demo && purpose === "bid_preauth" ? (
              <button
                type="button"
                className="comic-btn-invert"
                disabled={busy}
                onClick={() => {
                  destroyHelcimIframe();
                  onDeclinedRef.current?.();
                }}
              >
                Test-deny Sunday hold
              </button>
            ) : null}
            <button
              type="button"
              className="comic-btn-invert"
              disabled={busy}
              onClick={() => {
                destroyHelcimIframe();
                onClose();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
