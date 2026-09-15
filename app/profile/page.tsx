"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useBidder } from "@/components/BidderProvider";
import { ProfileFields } from "@/components/ProfileFields";
import { INTERAC_EMAIL, PICKUP_INSTRUCTIONS, paymentMethodLabel } from "@/lib/payments";
import { emptyProfileInput, type ProfileInput } from "@/lib/profileTypes";

export default function ProfilePage() {
  const { user, ready, refresh, requestAuth } = useBidder();
  const [form, setForm] = useState<ProfileInput>(emptyProfileInput());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName,
      phone: user.phone,
      street: user.street,
      city: user.city,
      province: user.province || "ON",
      postalCode: user.postalCode,
      paymentMethod: user.paymentMethod,
    });
  }, [user]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not save.");
      await refresh();
      setMessage("Bidder card saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="font-comic">Loading paddle…</p>;

  if (!user) {
    return (
      <div className="comic-panel p-6">
        <h1 className="font-display text-5xl text-[#FF0000]">Bidder profile</h1>
        <p className="mt-2 font-comic">Log in to edit shipping and payment prefs.</p>
        <button
          type="button"
          className="comic-btn mt-4"
          onClick={() => requestAuth(undefined, "login")}
        >
          Log In
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="comic-panel p-4">
        <h1 className="font-display text-5xl text-brand-red">Bidder profile</h1>
        <p className="font-comic text-sm">{user.email}</p>
      </div>
      <form
        onSubmit={onSubmit}
        className="comic-panel space-y-4 p-5"
      >
        <ProfileFields value={form} onChange={setForm} />
        <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm">
          Interac recipient: <strong>{INTERAC_EMAIL}</strong>
          <br />
          {PICKUP_INSTRUCTIONS}
        </p>
        <p className="font-comic text-sm">
          Current method: <strong>{paymentMethodLabel(form.paymentMethod)}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="comic-btn" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          <Link href="/checkout" className="comic-btn-invert">
            Winning checkout
          </Link>
        </div>
        {message && <p className="font-display text-2xl">{message}</p>}
      </form>
    </div>
  );
}
