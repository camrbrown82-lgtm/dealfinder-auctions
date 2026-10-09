"use client";

import { useEffect, useState } from "react";

type EbayStatus = {
  configured: boolean;
  connected: boolean;
  mockMode: boolean;
  env: string;
  marketplaceId: string;
  username: string | null;
  hasPolicies: boolean;
};

export function EbayDesk() {
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/ebay", { credentials: "include", cache: "no-store" });
    const json = (await response.json()) as EbayStatus & { error?: string };
    if (!response.ok) {
      setError(json.error || "Could not load eBay status.");
      return;
    }
    setStatus(json);
  }

  useEffect(() => {
    void load();
  }, []);

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ebay/disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not disconnect eBay.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect eBay.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="comic-panel space-y-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl sm:text-3xl">eBay cross-post</h3>
          <p className="font-comic text-sm">
            eBay is optional on Buy Now only — not in the warehouse AI generator. Connect the house seller once,
            then each Buy Now item can be listed without signing in again.
          </p>
        </div>
        {status?.connected ? (
          <button type="button" className="comic-btn-invert !text-sm" disabled={busy} onClick={() => void disconnect()}>
            Disconnect eBay
          </button>
        ) : status?.configured ? (
          <a className="comic-btn !text-sm" href="/api/admin/ebay/connect">
            Connect eBay
          </a>
        ) : null}
      </div>
      {error ? <p className="font-comic text-sm text-brand-red">{error}</p> : null}
      {status ? (
        <p className="font-comic text-sm">
          {status.connected
            ? `Connected${status.username ? ` as ${status.username}` : ""} · ${status.marketplaceId} · ${status.env}${
                status.hasPolicies ? "" : " · add payment/return/shipping policies in eBay Seller Hub once"
              }`
            : status.mockMode
              ? "No eBay app keys yet. List on eBay still saves a local ticket so you can try the button. Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME, then Connect eBay once."
              : `Keys are on this server (${status.env}, ${status.marketplaceId}). Connect eBay once to publish live listings.`}
        </p>
      ) : (
        <p className="font-comic text-sm">Checking eBay…</p>
      )}
    </section>
  );
}
