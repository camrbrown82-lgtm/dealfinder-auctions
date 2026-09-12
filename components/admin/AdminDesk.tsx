"use client";

import type { ReactNode } from "react";
import { FormEvent, useEffect, useState } from "react";
import type { PayoutItem } from "@/lib/payouts";
import type { AuctionEvent, AuctionLot, Consignment, PayoutRow } from "@/lib/utils";

export type AdminPayload = {
  source: "demo" | "supabase";
  queue: Consignment[];
  inventory: AuctionLot[];
  events: AuctionEvent[];
  payouts: PayoutRow[];
  payoutItems?: PayoutItem[];
  suggestedLotNumber?: string;
  suggestedAuctionNumber?: string;
  consignors?: string[];
};

export type AdminDeskApi = {
  data: AdminPayload;
  error: string | null;
  notice: string | null;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  load: () => Promise<void>;
  mutate: (url: string, init: RequestInit) => Promise<Record<string, any> | undefined>;
  logout: () => Promise<void>;
};

export function AdminDesk({ children }: { children: (desk: AdminDeskApi) => ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin");
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Failed to load admin");
      return;
    }
    setAuthed(true);
    setData(json);
    setError(null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Login failed");
      return;
    }
    setPassword("");
    await load();
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthed(false);
    setData(null);
  }

  async function mutate(url: string, init: RequestInit) {
    setError(null);
    setNotice(null);
    const response = await fetch(url, init);
    const json = await response.json();
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    if (!response.ok) {
      setError(json.error || "Update failed");
      return;
    }
    await load();
    return json as Record<string, any>;
  }

  if (authed === null) {
    return <p className="font-display text-2xl">Checking admin lock…</p>;
  }

  if (!authed) {
    return (
      <form onSubmit={login} className="mx-auto max-w-md space-y-4 comic-panel bg-[#FFF7D1] p-6">
        <h1 className="font-display text-4xl">Admin lock</h1>
        <p className="font-comic text-sm">
          Staff only. Default demo password is <strong>hammer</strong> unless you set
          ADMIN_PASSWORD.
        </p>
        <label className="block font-comic font-bold">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border-4 border-black px-3 py-2"
            required
          />
        </label>
        <button type="submit" className="comic-btn w-full">
          Enter
        </button>
        {error && <p className="font-display text-xl text-brand-red">{error}</p>}
      </form>
    );
  }

  if (!data) return <p className="font-display text-2xl">Loading desk…</p>;

  return (
    <>
      {children({
        data,
        error,
        notice,
        setError,
        setNotice,
        load,
        mutate,
        logout,
      })}
    </>
  );
}
