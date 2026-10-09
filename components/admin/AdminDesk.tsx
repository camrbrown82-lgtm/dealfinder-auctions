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
import { AdminDarkToggle } from "@/components/admin/AdminDarkToggle";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const loadGen = useRef(0);

  async function sessionOk() {
    const response = await fetch("/api/admin/login", fetchOpts);
    if (response.ok) return true;
    const json = await response.json().catch(() => ({}));
    const message = readError(json, "");
    if (message && message !== "Admin login required.") setError(message);
    return false;
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
    let cancelled = false;
    void (async () => {
      // Restore an existing staff cookie. Do not sign out on mount — that
      // kicked every other open admin tab (and made two staff share a lock).
      const open = await sessionOk();
      if (cancelled) return;
      if (!open) {
        await dropSession();
        return;
      }
      const opened = await load();
      if (cancelled) return;
      if (opened === "unauth") await dropSession();
    })();
    return () => {
      cancelled = true;
    };
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
        body: JSON.stringify({ email, password }),
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
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        className="relative mx-auto w-full max-w-md space-y-4 comic-panel p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl text-brand-red sm:text-4xl">Admin lock</h1>
          <AdminDarkToggle />
        </div>
        <p className="font-comic text-sm">
          Staff only. A customer login on this browser closes the desk. Log out of that paddle
          before entering. Each staff browser keeps its own login.
        </p>
        <input
          type="text"
          name="df-admin-user"
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          readOnly
        />
        <label className="block font-comic font-bold">
          Staff email
          <input
            type="email"
            name="df-admin-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full border-4 border-black bg-white px-3 py-2"
            required
            autoFocus
            autoComplete="username"
            spellCheck={false}
          />
        </label>
        <label className="block font-comic font-bold">
          Password
          <input
            type="password"
            name="df-admin-gate"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border-4 border-black bg-white px-3 py-2"
            required
            autoComplete="current-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
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
    <p className="font-display text-2xl">{error ?? "Opening lock…"}</p>
  );
}
