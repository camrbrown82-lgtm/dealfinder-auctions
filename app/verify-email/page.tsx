"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBidder } from "@/components/BidderProvider";

function browserAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
}

function tokensFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    tokenHash: params.get("token_hash") || params.get("token") || hash.get("token_hash") || "",
    type: params.get("type") || hash.get("type") || "signup",
    accessToken: hash.get("access_token") || "",
  };
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { refresh } = useBidder();
  const [status, setStatus] = useState<"working" | "ok" | "pending" | "error">("working");
  const [message, setMessage] = useState("Confirming your email…");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const supabase = browserAuth();
    let cancelled = false;
    const { tokenHash, type, accessToken } = tokensFromLocation();

    async function finish(payload: { accessToken?: string; tokenHash?: string; type?: string }) {
      if (doneRef.current || cancelled) return;
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (cancelled || doneRef.current) return;
      if (!response.ok) {
        setStatus("pending");
        setMessage(json.error || "Check your inbox to verify your email.");
        return;
      }
      doneRef.current = true;
      await refresh();
      window.dispatchEvent(new Event("dealfinder-auth"));
      setStatus("ok");
      setMessage("Email confirmed. Taking you to the live floor…");
      router.replace(json.redirect || "/live");
    }

    if (tokenHash) {
      void finish({ tokenHash, type });
      return () => {
        cancelled = true;
      };
    }

    if (accessToken) {
      void finish({ accessToken });
      return () => {
        cancelled = true;
      };
    }

    if (!supabase) {
      setStatus("pending");
      setMessage("Check your inbox and tap Verify Account in the welcome email.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) void finish({ accessToken: token });
      else {
        setStatus("pending");
        setMessage("Check your inbox and tap Verify Account. Then you will land on the live floor.");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void finish({ accessToken: session.access_token });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, refresh]);

  async function resend() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await response.json();
      if (json.alreadyVerified) {
        setStatus("ok");
        setMessage("This email is already verified. You can log in.");
        return;
      }
      if (!response.ok) throw new Error(json.error || "Could not resend.");
      setMessage("If that address is on file, we sent another DealFinder welcome with a Verify Account button.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not resend.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-ink px-4 py-12 text-center">
      <div className="comic-panel max-w-lg bg-brand-cream p-6">
        <p className="font-display text-sm tracking-[0.3em] text-brand-red">CHECK YOUR INBOX</p>
        <h1 className="mt-2 font-display text-4xl leading-none text-brand-red">Verify your email</h1>
        <p className="mt-4 font-comic text-base">{message}</p>
        {status !== "ok" && status !== "working" && (
          <div className="mt-4 space-y-2 text-left">
            <label className="block font-comic text-sm font-bold">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                autoComplete="email"
              />
            </label>
            <button type="button" className="comic-btn w-full" disabled={busy || !email} onClick={() => void resend()}>
              {busy ? "Sending…" : "Resend welcome email"}
            </button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/live" className="comic-btn">
            Live lots
          </Link>
          <Link href="/" className="comic-btn-invert">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
