"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { emptyProfile, profileComplete } from "@/lib/catalog";
import type { ProfileFields, PublicUser } from "@/lib/types";
import { ProfileFieldsForm } from "./profile-fields";

type AuthMode = "login" | "signup";
type ResumeBid = (() => Promise<void>) | null;

type BidderContextValue = {
  user: PublicUser | null;
  ready: boolean;
  refresh: () => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  requestAuth: (resume?: ResumeBid, mode?: AuthMode) => void;
};

const BidderContext = createContext<BidderContextValue | null>(null);

function AuthModal({
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
  existing: PublicUser | null;
  resumeBid: boolean;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  onAuthenticated: (user: PublicUser) => Promise<void>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<ProfileFields>(emptyProfile());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cardOnly, setCardOnly] = useState(false);

  if (!open) return null;

  const existingComplete = existing ? profileComplete(existing) : false;
  const showProfile = mode === "signup" || cardOnly || Boolean(existing && !existingComplete);
  const hideCredentials = cardOnly || Boolean(existing && !existingComplete);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (cardOnly || (existing && !profileComplete(existing))) {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not save profile.");
        setCardOnly(false);
        await onAuthenticated(json.user);
        return;
      }
      if (mode === "login") {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not log in.");
        const session = await fetch("/api/auth").then((r) => r.json());
        if (!session.user) throw new Error("Session missing after login.");
        if (!profileComplete(session.user)) {
          setProfile({
            fullName: session.user.fullName,
            phone: session.user.phone,
            street: session.user.street,
            city: session.user.city,
            province: session.user.province || "ON",
            postalCode: session.user.postalCode,
            paymentMethod: session.user.paymentMethod,
          });
          setCardOnly(true);
          onMode("signup");
          setError("Finish your bidder card — then we drop the paddle.");
          return;
        }
        await onAuthenticated(session.user);
        return;
      }
      const res = await fetch("/api/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...profile }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not sign up.");
      const session = await fetch("/api/auth").then((r) => r.json());
      if (!session.user) throw new Error("Session missing after signup.");
      await onAuthenticated(session.user);
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
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto border-4 border-black bg-[#FFF7D1] shadow-[8px_8px_0_0_#000]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b-4 border-black bg-[#FF0000] px-4 py-3 text-white">
          <div>
            <p className="font-display text-sm tracking-[0.3em]">HOLD IT, PADDLE!</p>
            <h2 id="auth-modal-title" className="font-display text-4xl leading-none">
              {mode === "login" ? "Log in to bid" : "Sign up to bid"}
            </h2>
            <p className="mt-1 font-comic text-sm">
              Browse free. Bids need a DealFinder account — we will fire your paddle the moment you are in.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/");
            }}
            aria-label="Close and return to homepage"
            className="shrink-0 border-4 border-black bg-[#FFF7D1] px-3 py-1 font-display text-3xl leading-none text-black shadow-[4px_4px_0_0_#000] hover:-translate-y-0.5"
          >
            X
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              className={mode === "login" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
              onClick={() => {
                setCardOnly(false);
                onMode("login");
              }}
            >
              Log In
            </button>
            <button
              type="button"
              className={mode === "signup" ? "comic-btn !text-base" : "comic-btn-invert !text-base"}
              onClick={() => onMode("signup")}
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
          {showProfile && <ProfileFieldsForm value={profile} onChange={setProfile} />}
          {error && <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">{error}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="comic-btn" disabled={busy}>
              {busy ? "Working…" : mode === "login" ? (resumeBid ? "Log In & Bid" : "Log In") : resumeBid ? "Create Account & Bid" : "Create Account"}
            </button>
            <button type="button" className="comic-btn-invert" onClick={onClose}>
              Keep browsing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BidderProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signup");
  const [resumeBid, setResumeBid] = useState(false);
  const resumeRef = useRef<ResumeBid>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth");
      const json = await res.json();
      const next = json.user ?? null;
      setUser(next);
      setReady(true);
      return next as PublicUser | null;
    } catch {
      setUser(null);
      setReady(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestAuth = useCallback((resume?: ResumeBid, nextMode: AuthMode = "signup") => {
    resumeRef.current = resume ?? null;
    setResumeBid(Boolean(resume));
    setMode(nextMode);
    setOpen(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
  }, []);

  async function onAuthenticated(next: PublicUser) {
    setUser(next);
    setOpen(false);
    const resume = resumeRef.current;
    resumeRef.current = null;
    if (resume) await resume();
  }

  const value = useMemo(
    () => ({ user, ready, refresh, logout, requestAuth }),
    [user, ready, refresh, logout, requestAuth],
  );

  return (
    <BidderContext.Provider value={value}>
      {children}
      <AuthModal
        open={open}
        mode={mode}
        existing={user}
        resumeBid={resumeBid}
        onMode={setMode}
        onClose={() => {
          setOpen(false);
          resumeRef.current = null;
        }}
        onAuthenticated={onAuthenticated}
      />
    </BidderContext.Provider>
  );
}

export function useBidder() {
  const ctx = useContext(BidderContext);
  if (!ctx) throw new Error("useBidder must be used inside BidderProvider");
  return ctx;
}
