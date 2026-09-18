"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileFields } from "@/components/ProfileFields";
import {
  emptyProfileInput,
  isProfileComplete,
  type BidderProfile,
  type ProfileInput,
} from "@/lib/profileTypes";

type AuthMode = "login" | "signup";
type Panel = AuthMode | "forgot";

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
  const [panel, setPanel] = useState<Panel>(mode);
  const [resetSent, setResetSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setPanel(mode);
    setResetSent(false);
    setDevResetUrl(null);
    setError(null);
  }, [mode, open]);

  function goHome() {
    onClose();
    router.push("/");
  }

  if (!open) return null;

  const completeExisting = existing && isProfileComplete(existing);
  const needsProfile =
    panel === "signup" || completing || Boolean(existing && !completeExisting);
  const hideCredentials = completing || Boolean(existing && !completeExisting);
  const title =
    panel === "forgot"
      ? "Forgot password?"
      : panel === "login"
        ? "Log in to bid"
        : "Sign up to bid";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (panel === "forgot") {
        const response = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not send reset email.");
        setResetSent(true);
        setDevResetUrl(typeof json.devResetUrl === "string" ? json.devResetUrl : null);
        return;
      }

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

      if (panel === "login") {
        const response = await fetch("/api/auth", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not log in.");
        const me = await fetch("/api/auth", { credentials: "include" }).then((r) => r.json());
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
      if (!response.ok) throw new Error(json.error || "Could not sign up.");
      const me = await fetch("/api/auth", { credentials: "include" }).then((r) => r.json());
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
              {title}
            </h2>
            <p className="mt-1 font-comic text-sm">
              {panel === "forgot"
                ? "Enter the email on your bidder card. We will send a one-hour reset link."
                : "Browse free. Bids need a DealFinder account — we will fire your paddle the moment you are in."}
            </p>
          </div>
          <button
            type="button"
            onClick={goHome}
            aria-label="Close and return to homepage"
            className="comic-btn-invert shrink-0 !px-3 !py-1 !text-3xl leading-none"
          >
            X
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 p-4">
          {panel !== "forgot" && (
            <div className="flex gap-2">
              <button
                type="button"
                className={panel === "login" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
                onClick={() => {
                  setCompleting(false);
                  setResetSent(false);
                  setPanel("login");
                  onMode("login");
                }}
              >
                Log In
              </button>
              <button
                type="button"
                className={panel === "signup" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
                onClick={() => {
                  setResetSent(false);
                  setPanel("signup");
                  onMode("signup");
                }}
              >
                Sign Up
              </button>
            </div>
          )}

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
              {panel !== "forgot" && (
                <label className="block font-comic text-sm font-bold">
                  Password
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                    autoComplete={panel === "login" ? "current-password" : "new-password"}
                  />
                </label>
              )}
              {panel === "login" && (
                <button
                  type="button"
                  className="font-comic text-sm font-bold underline"
                  onClick={() => {
                    setError(null);
                    setResetSent(false);
                    setPanel("forgot");
                  }}
                >
                  Forgot password?
                </button>
              )}
            </>
          )}

          {panel === "forgot" && resetSent && (
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">
              If that email has a paddle, we sent a reset link. Check inbox and spam.
              {devResetUrl ? (
                <>
                  {" "}
                  Demo link:{" "}
                  <a href={devResetUrl} className="underline">
                    set a new password
                  </a>
                </>
              ) : null}
            </p>
          )}

          {needsProfile && <ProfileFields value={profile} onChange={setProfile} />}

          {error && (
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {panel === "forgot" ? (
              <>
                {!resetSent && (
                  <button type="submit" className="comic-btn" disabled={busy}>
                    {busy ? "Sending…" : "Email reset link"}
                  </button>
                )}
                <button
                  type="button"
                  className="comic-btn-invert"
                  onClick={() => {
                    setResetSent(false);
                    setDevResetUrl(null);
                    setPanel("login");
                    onMode("login");
                  }}
                >
                  Back to log in
                </button>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  className="comic-btn"
                  disabled={busy || (needsProfile && !profile.preauthTermsAgreed)}
                >
                  {busy
                    ? "Working…"
                    : panel === "login"
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
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
