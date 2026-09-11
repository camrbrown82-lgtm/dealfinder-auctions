"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileFieldsForm } from "@/components/profile-fields";
import { useBidder } from "@/components/bidder-provider";
import { emptyProfile } from "@/lib/catalog";
import type { ProfileFields } from "@/lib/types";

export default function ProfilePage() {
  const { user, ready, refresh, requestAuth } = useBidder();
  const [profile, setProfile] = useState<ProfileFields>(emptyProfile());
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        fullName: user.fullName,
        phone: user.phone,
        street: user.street,
        city: user.city,
        province: user.province || "ON",
        postalCode: user.postalCode,
        paymentMethod: user.paymentMethod,
      });
    }
  }, [user]);

  if (!ready) return <p className="font-display text-4xl">Loading paddle…</p>;
  if (!user) {
    return (
      <div className="comic-panel max-w-lg space-y-4 p-6">
        <h1 className="font-display text-5xl">Bidder profile</h1>
        <p className="font-comic font-bold">Log in to restore your paddle and shipping card.</p>
        <button type="button" className="comic-btn" onClick={() => requestAuth(undefined, "login")}>
          Log in
        </button>
      </div>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save.");
      await refresh();
      setNotice("Bidder card saved.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-6xl">Bidder profile</h1>
      <p className="font-comic font-bold">
        {user.email} · paddle {user.status}
      </p>
      <form onSubmit={save} className="comic-panel space-y-4 p-6">
        <ProfileFieldsForm value={profile} onChange={setProfile} />
        {notice && <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">{notice}</p>}
        <button type="submit" className="comic-btn" disabled={busy}>
          {busy ? "Working…" : "Save profile"}
        </button>
      </form>
      <Link href="/checkout" className="comic-btn-invert inline-flex">
        Winning checkout
      </Link>
    </div>
  );
}
