"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { PayoutItem } from "@/lib/payouts";
import type { AuctionEvent, AuctionLot, Consignment, PayoutRow } from "@/lib/utils";
import type { HouseDeskSettings } from "@/lib/houseDesk";

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
  houseSettings?: HouseDeskSettings;
};

export type AdminDeskApi = {
  data: AdminPayload;
  error: string | null;
  notice: string | null;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  load: () => Promise<"ok" | "unauth" | "error">;
  mutate: (url: string, init: RequestInit) => Promise<Record<string, any> | undefined>;
  logout: () => Promise<void>;
};

const AdminDeskContext = createContext<AdminDeskApi | null>(null);
const SESSION_FLAG = "df_admin_ui";
const fetchOpts: RequestInit = { credentials: "include", cache: "no-store" };

function readError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const record = json as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
  }
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

function flagOn() {
  try {
    sessionStorage.setItem(SESSION_FLAG, "1");
  } catch {
    /* ignore */
  }
}

function flagOff() {
  try {
    sessionStorage.removeItem(SESSION_FLAG);
  } catch {
    /* ignore */
  }
}

export function useAdminDesk() {
  const value = useContext(AdminDeskContext);
  if (!value) {
    throw new Error("useAdminDesk must be used under AdminDeskProvider");
  }
  return value;
}

export function AdminDeskProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const loadGen = useRef(0);

  async function sessionOk() {
    const response = await fetch("/api/admin/login", fetchOpts);
    return response.ok;
  }

  async function dropSession() {
    flagOff();
    setAuthed(false);
    setData(null);
  }

  async function load(): Promise<"ok" | "unauth" | "error"> {
    const mine = ++loadGen.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/admin", { ...fetchOpts, signal: controller.signal });
      if (mine !== loadGen.current) return "ok";
      if (response.status === 401) {
        if (await sessionOk()) return "error";
        if (mine !== loadGen.current) return "ok";
        await dropSession();
        return "unauth";
      }
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(readError(json, "Failed to load admin"));
        return "error";
      }
      flagOn();
      setAuthed(true);
      setData(json);
      setError(null);
      return "ok";
    } catch {
      if (mine !== loadGen.current) return "ok";
      setError("Could not load the house. Try again.");
      return "error";
    } finally {
      window.clearTimeout(timer);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const ok = await sessionOk();
        if (ok) {
          flagOn();
          setAuthed(true);
          await load();
          return;
        }
        await dropSession();
      } catch {
        setAuthed(false);
        setError("Could not reach the admin lock. Try again.");
      }
    })();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      const response = await fetch("/api/admin/login", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthed(false);
        setError(readError(json, "Wrong password."));
        return;
      }
      setPassword("");
      flagOn();
      setAuthed(true);
      const opened = await load();
      if (opened === "unauth") {
        setError("Password was accepted, but the login cookie did not stick. Hard-refresh this page.");
      }
    } catch {
      setAuthed(false);
      setError("Could not reach login. Try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { ...fetchOpts, method: "DELETE" });
    await dropSession();
    setError(null);
  }

  async function mutate(url: string, init: RequestInit) {
    setError(null);
    setNotice(null);
    const response = await fetch(url, { ...init, credentials: "include", cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.status === 401) {
      if (await sessionOk()) {
        setError(readError(json, "That action was denied. Try again."));
        return;
      }
      await dropSession();
      return;
    }
    if (!response.ok) {
      setError(readError(json, "Update failed"));
      return;
    }
    await load();
    return json as Record<string, any>;
  }

  const desk: AdminDeskApi = {
    data: data as AdminPayload,
    error,
    notice,
    setError,
    setNotice,
    load,
    mutate,
    logout,
  };

  if (data && authed) {
    return (
      <AdminDeskContext.Provider value={desk}>
        <div className="min-w-0 max-w-full overflow-x-hidden">{children}</div>
      </AdminDeskContext.Provider>
    );
  }

  if (authed === false) {
    return (
      <form
        onSubmit={login}
        className="mx-auto w-full max-w-md space-y-4 comic-panel p-4 sm:p-6"
      >
          <h1 className="font-display text-3xl text-brand-red sm:text-4xl">Admin lock</h1>
        <p className="font-comic text-sm">Staff only. Use the admin password from Vercel / .env.local.</p>
        <label className="block font-comic font-bold">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border-4 border-black px-3 py-2"
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="comic-btn w-full" disabled={signingIn}>
          {signingIn ? "Signing in…" : "Enter"}
        </button>
        {error && <p className="font-display text-xl text-brand-red">{error}</p>}
      </form>
    );
  }

  return (
    <p className="font-display text-2xl">{error ?? "Loading house…"}</p>
  );
}
