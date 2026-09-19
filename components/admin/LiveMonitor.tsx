"use client";

import { useEffect, useState } from "react";
import { BidAuditModal } from "@/components/admin/BidAuditModal";
import { LotTimer } from "@/components/LotTimer";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/utils";
import type { AdminBid, MonitorLot } from "@/lib/adminTypes";

export function LiveMonitor({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [lots, setLots] = useState<MonitorLot[]>([]);
  const [source, setSource] = useState("demo");
  const [auditLot, setAuditLot] = useState<MonitorLot | null>(null);
  const [bids, setBids] = useState<AdminBid[]>([]);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { start: string }>>({});

  async function load() {
    const response = await fetch("/api/admin/monitor", { credentials: "include", cache: "no-store" });
    const json = await response.json();
    if (!response.ok) return;
    setLots(json.lots ?? []);
    setSource(json.source ?? "demo");
    const next: typeof drafts = {};
    for (const lot of json.lots as MonitorLot[]) {
      next[lot.id] = {
        start: String(lot.startingBid),
      };
    }
    setDrafts(next);
  }

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel("ops-live-lots")
      .on("postgres_changes", { event: "*", schema: "public", table: "lots" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, () => {
        void load();
        if (auditLot) void openAudit(auditLot);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [auditLot]);

  async function openAudit(lot: MonitorLot) {
    setAuditLot(lot);
    const response = await fetch(`/api/admin/bids?lotId=${encodeURIComponent(lot.id)}`);
    const json = await response.json();
    setBids(json.bids ?? []);
  }

  async function voidBid(bidId: string) {
    if (!auditLot) return;
    setBusy(true);
    const response = await fetch("/api/admin/bids", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidId, lotId: auditLot.id }),
    });
    const json = await response.json();
    setBusy(false);
    if (!response.ok) {
      onNotice(json.error || "Could not void bid.");
      return;
    }
    onNotice(`Bid voided. High is now ${formatCurrency(json.currentBid ?? 0)}.`);
    await openAudit(auditLot);
    await load();
  }

  async function savePricing(lot: MonitorLot) {
    const draft = drafts[lot.id];
    const response = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "lot",
        id: lot.id,
        startingBid: Number(draft?.start) || 0,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      onNotice(json.error || "Could not update pricing.");
      return;
    }
    onNotice(`Updated starting bid on ${lot.title}`);
    await load();
  }

  return (
    <section className="space-y-4">
      <div className="comic-panel p-4">
        <p className="font-display text-sm tracking-[0.25em] text-brand-red">LIVE AUCTION MONITOR</p>
        <h2 className="font-display text-2xl text-brand-red sm:text-4xl">Floor feed · {source}</h2>
        <p className="font-comic text-sm">
          Realtime on lots + bids when Supabase is connected; otherwise this page polls every 4s.
        </p>
      </div>
      <div className="comic-table-wrap">
        <table className="w-full min-w-[960px] border-collapse font-comic text-sm">
          <thead className="bg-[#FF0000] text-left text-white">
            <tr>
              <th className="border-b-4 border-black p-3">Lot</th>
              <th className="border-b-4 border-black p-3">High paddle</th>
              <th className="border-b-4 border-black p-3">Max / current</th>
              <th className="border-b-4 border-black p-3">Clock</th>
              <th className="border-b-4 border-black p-3">Modify start</th>
              <th className="border-b-4 border-black p-3">Audit</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => {
              const draft = drafts[lot.id] ?? {
                start: String(lot.startingBid),
              };
              return (
                <tr key={lot.id} className="bg-[#FFF7D1]">
                  <td className="border-b-2 border-black p-3">
                    <p className="font-display text-lg">{lot.title}</p>
                    <p>
                      {lot.auctionNumber} · {lot.lotNumber} · {(lot.status ?? "").toUpperCase()}
                    </p>
                  </td>
                  <td className="border-b-2 border-black p-3">{lot.highBidder || "—"}</td>
                  <td className="border-b-2 border-black p-3 font-bold">
                    {formatCurrency(lot.currentBid)}
                    <span className="block font-normal">{lot.bidCount} attempts</span>
                  </td>
                  <td className="border-b-2 border-black p-3">
                    <LotTimer endsAt={lot.endsAt} />
                  </td>
                  <td className="border-b-2 border-black p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label>
                        Start
                        <input
                          type="number"
                          value={draft.start}
                          onChange={(e) =>
                            setDrafts((current) => ({
                              ...current,
                              [lot.id]: { ...draft, start: e.target.value },
                            }))
                          }
                          className="mt-1 w-24 border-4 border-black bg-white px-2 py-1"
                        />
                      </label>
                      <button
                        type="button"
                        className="comic-btn-invert !text-sm"
                        onClick={() => void savePricing(lot)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                  <td className="border-b-2 border-black p-3">
                    <button
                      type="button"
                      className="comic-btn !text-sm"
                      onClick={() => void openAudit(lot)}
                    >
                      Bid History Audit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {auditLot && (
        <BidAuditModal
          title={auditLot.title}
          bids={bids}
          busy={busy}
          onClose={() => setAuditLot(null)}
          onVoid={(id) => void voidBid(id)}
        />
      )}
    </section>
  );
}
