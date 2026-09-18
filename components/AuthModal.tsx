"use client";

import { FormEvent, useEffect, useState } from "react";
import { ProfileFields } from "@/components/ProfileFields";
import {
  emptyProfileInput,
  isProfileComplete,
  type BidderProfile,
  type ProfileInput,
} from "@/lib/profileTypes";

type AuthMode = "login" | "signup";

export function AuthModal({
  open,
  mode,
  existing,
  resumeBid,
  onMode,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  mode: AuthMode;
  existing: BidderProfile | null;
  resumeBid: boolean;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  onAuthenticated: (user: BidderProfile) => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<ProfileInput>(emptyProfileInput());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const confirmedSession = Boolean(existing);

  useEffect(() => {
    if (!open) {
      setNeedsVerification(false);
      setError(null);
      setBusy(false);
      return;
    }
    if (existing) setNeedsVerification(false);
  }, [open, existing]);

  useEffect(() => {
    if (!open || !needsVerification || existing) return;
    const timer = window.setInterval(async () => {
      const me = await fetch("/api/auth", { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (me.user) await onAuthenticated(me.user);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, needsVerification, existing, onAuthenticated]);

  function closeModal() {
    onClose();
  }

  if (!open) return null;

  const completeExisting = existing && isProfileComplete(existing);
  const needsProfile =
    mode === "signup" || completing || Boolean(existing && !completeExisting);
  const hideCredentials = completing || Boolean(existing && !completeExisting);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (completing || (existing && !isProfileComplete(existing))) {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not save profile.");
        setCompleting(false);
        await onAuthenticated(json.user);
        return;
      }

      if (mode === "login") {
        const response = await fetch("/api/auth", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await response.json();
        if (json.alreadyVerified) {
          setNeedsVerification(false);
        }
        if (json.needsVerification && !json.alreadyVerified) {
          const me = await fetch("/api/auth", { credentials: "include", cache: "no-store" }).then((r) => r.json());
          if (me.user) {
            await onAuthenticated(me.user);
            return;
          }
          setNeedsVerification(true);
          setError(json.error || "Check your inbox to verify your email.");
          return;
        }
        if (!response.ok) throw new Error(json.error || "Could not log in.");
        const me = await fetch("/api/auth", { credentials: "include", cache: "no-store" }).then((r) => r.json());
        if (!me.user) throw new Error("Session missing after login.");
        if (!isProfileComplete(me.user)) {
          setProfile({
            fullName: me.user.fullName,
            phone: me.user.phone,
            street: me.user.street,
            city: me.user.city,
            province: me.user.province || "AB",
            postalCode: me.user.postalCode,
            paymentMethod: me.user.paymentMethod,
            preauthTermsAgreed: Boolean(me.user.preauthTermsAgreed),
          });
          setCompleting(true);
          onMode("signup");
          setError("Finish your bidder card — then we drop the paddle.");
          return;
        }
        await onAuthenticated(me.user);
        return;
      }

      const response = await fetch("/api/auth", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...profile }),
      });
      const json = await response.json();
      if (json.alreadyVerified) {
        setNeedsVerification(false);
        setError("This email is already verified. Log in to continue.");
        onMode("login");
        return;
      }
      if (json.needsVerification) {
        setNeedsVerification(true);
        setError(
          json.mailSent === false
            ? json.mailError || "We could not send the confirmation email. Tap resend, or ask the desk to check Resend."
            : "Check your inbox to verify your email before you can bid.",
        );
        return;
      }
      if (!response.ok) throw new Error(json.error || "Could not sign up.");
      const me = await fetch("/api/auth", { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (!me.user) throw new Error("Session missing after signup.");
      await onAuthenticated(me.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto comic-panel"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b-4 border-black bg-brand-cream px-4 py-3">
          <div>
            <p className="font-display text-sm tracking-[0.3em] text-brand-red">HOLD IT, PADDLE!</p>
            <h2 id="auth-modal-title" className="font-display text-4xl leading-none text-brand-red">
              {mode === "login" ? "Log in to bid" : "Sign up to bid"}
            </h2>
            <p className="mt-1 font-comic text-sm">
              Browse free. Bids need a DealFinder account — we will fire your paddle
              the moment you are in.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="comic-btn-invert shrink-0 !px-3 !py-1 !text-3xl leading-none"
          >
            X
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 p-4">
          {needsVerification && !confirmedSession ? (
            <div className="space-y-3">
              <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">
                Check your inbox to verify your email before you can use this paddle. Nothing is charged for signing up.
              </p>
              {error && (
                <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="comic-btn"
                disabled={busy || !email}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const response = await fetch("/api/auth", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email }),
                    });
                    const json = await response.json();
                    if (json.alreadyVerified) {
                      setNeedsVerification(false);
                      setError("This email is already verified. Log in to continue.");
                      onMode("login");
                      return;
                    }
                    if (!response.ok) throw new Error(json.error || "Could not resend.");
                    setError(
                      json.mailSent === false
                        ? json.mailError || "Resend did not deliver. Ask the desk to check the sender domain."
                        : "We sent another confirmation email.",
                    );
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not resend.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Sending…" : "Resend confirmation"}
              </button>
              <button type="button" className="comic-btn-invert" onClick={onClose}>
                Keep browsing
              </button>
            </div>
          ) : (
            <>
          <div className="flex gap-2">
            <button
              type="button"
              className={mode === "login" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
              onClick={() => {
                setCompleting(false);
                setNeedsVerification(false);
                onMode("login");
              }}
            >
              Log In
            </button>
            <button
              type="button"
              className={mode === "signup" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
              onClick={() => {
                setNeedsVerification(false);
                onMode("signup");
              }}
            >
              Sign Up
            </button>
          </div>

          {!hideCredentials && (
            <>
              <label className="block font-comic text-sm font-bold">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                  autoComplete="email"
                />
              </label>
              <label className="block font-comic text-sm font-bold">
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </label>
            </>
          )}

          {needsProfile && (
            <ProfileFields value={profile} onChange={setProfile} />
          )}

          {error && (
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="comic-btn"
              disabled={busy}
            >
              {busy
                ? "Working…"
                : mode === "login"
                  ? resumeBid
                    ? "Log In & Bid"
                    : "Log In"
                  : resumeBid
                    ? "Create Account & Bid"
                    : "Create Account"}
            </button>
            <button type="button" className="comic-btn-invert" onClick={onClose}>
              Keep browsing
            </button>
          </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
