"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBidder } from "@/components/BidderProvider";

function ResetPasswordForm() {
  const router = useRouter();
  const { refresh } = useBidder();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash") || params.get("token") || "";
  const type = params.get("type") || "recovery";
  const demo = params.get("demo") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = Boolean(tokenHash || demo);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      setError("Use a password of at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, tokenHash, type, demo }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not reset password.");
      await refresh();
      window.dispatchEvent(new Event("dealfinder-auth"));
      router.replace(json.redirect || "/live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!ready ? (
        <p className="mt-4 font-comic text-sm">
          Use the Reset password button in your email, or request a new link from Log In.
        </p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-4 space-y-3">
          <label className="block font-comic text-sm font-bold">
            New password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              autoComplete="new-password"
            />
          </label>
          <label className="block font-comic text-sm font-bold">
            Confirm password
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              autoComplete="new-password"
            />
          </label>
          {error ? (
            <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">
              {error}
            </p>
          ) : null}
          <button type="submit" className="comic-btn w-full" disabled={busy}>
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-ink px-4 py-12">
      <div className="comic-panel w-full max-w-lg bg-brand-cream p-6">
        <p className="font-display text-sm tracking-[0.3em] text-brand-red">PADDLE</p>
        <h1 className="mt-2 font-display text-4xl leading-none text-brand-red">New password</h1>
        <Suspense fallback={<p className="mt-4 font-comic text-sm">Loading reset form…</p>}>
          <ResetPasswordForm />
        </Suspense>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/live" className="comic-btn-invert">
            Live lots
          </Link>
        </div>
      </div>
    </main>
  );
}
