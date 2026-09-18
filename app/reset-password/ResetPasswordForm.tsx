"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not reset password.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="comic-panel p-6">
        <p className="font-display text-sm tracking-[0.3em] text-brand-red">HOLD IT, PADDLE!</p>
        <h1 className="font-display text-4xl leading-none text-brand-red sm:text-5xl">
          Set a new password
        </h1>
        <p className="mt-2 font-comic text-sm">
          Choose a new paddle password. The email link expires after one hour.
        </p>

        {!token ? (
          <p className="mt-4 border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">
            This page needs a reset link from your email. Use Forgot password on the login desk.
          </p>
        ) : done ? (
          <div className="mt-4 space-y-3 font-comic">
            <p className="border-4 border-black bg-white px-3 py-2 font-bold">
              Password saved. Log in with the new one and get back on the floor.
            </p>
            <Link href="/" className="comic-btn inline-flex">
              Back to the floor
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
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
            {error && (
              <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold text-[#FF0000]">
                {error}
              </p>
            )}
            <button type="submit" className="comic-btn" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
