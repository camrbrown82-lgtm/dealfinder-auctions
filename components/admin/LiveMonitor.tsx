"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BidAuditModal } from "@/components/admin/BidAuditModal";
import { LotImage } from "@/components/LotImage";
import { LotTimer } from "@/components/LotTimer";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/utils";
import type { AdminBid, MonitorLot } from "@/lib/adminTypes";

/** A bid on the floor, or the opening price when nobody has bid yet. */
function bidState(lot: MonitorLot) {
  if (lot.highBidder) {
    return lot.bidCount > 1 ? `Live bid · ${lot.bidCount} bids` : "Live bid";
  }
  return "Opening price · no bids yet";
}

function LotThumb({ lot, size }: { lot: MonitorLot; size: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden border-4 border-black bg-white`}>
      {lot.image ? (
        <LotImage src={lot.image} alt={lot.title} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-display text-xs">
          NO PHOTO
        </span>
      )}
    </div>
  );
}

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
  const [search, setSearch] = useState("");
  const editingStart = useRef(new Set<string>());

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return lots;
    return lots.filter((lot) =>
      [lot.title, lot.lotNumber, lot.auctionNumber, lot.highBidder, lot.consignor]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [lots, search]);

  function editStart(lotId: string, start: string) {
    editingStart.current.add(lotId);
    setDrafts((current) => ({ ...current, [lotId]: { start } }));
  }

  async function load() {
    const response = await fetch("/api/admin/monitor", { credentials: "include", cache: "no-store" });
    const json = await response.json();
    if (!response.ok) return;
    const incoming = (json.lots ?? []) as MonitorLot[];
    setLots(incoming);
    setSource(json.source ?? "demo");
    setDrafts((current) => {
      const next: typeof drafts = {};
      for (const lot of incoming) {
        next[lot.id] =
          editingStart.current.has(lot.id) && current[lot.id]
            ? current[lot.id]
            : { start: String(lot.startingBid) };
      }
      return next;
    });
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
    editingStart.current.delete(lot.id);
    onNotice(`Updated starting bid on ${lot.title}`);
    await load();
  }

  return (
    <section className="space-y-4">
      <div className="comic-panel p-4">
        <p className="font-display text-sm tracking-[0.25em] text-brand-red">LIVE AUCTION MONITOR</p>
        <h2 className="font-display text-2xl text-brand-red sm:text-4xl">Floor feed · {source}</h2>
        <p className="font-comic text-sm">
          This week&apos;s live lots, then upcoming lots that already have a bid. Ended weeks stay off this desk.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a lot: title, lot #, auction #, paddle"
            className="min-w-0 flex-1 border-4 border-black bg-white px-3 py-2 font-comic sm:min-w-[260px]"
          />
          {search ? (
            <button type="button" className="comic-btn-invert !text-sm" onClick={() => setSearch("")}>
              Clear
            </button>
          ) : null}
          <p className="font-comic text-sm font-bold">
            {visible.length} of {lots.length} lots
          </p>
        </div>
      </div>
      <div className="space-y-3 xl:hidden">
        {visible.length === 0 ? (
          <p className="comic-panel p-4 font-comic">
            {lots.length === 0
              ? "No lots are live in this week's auction."
              : "No lots match that search."}
          </p>
        ) : null}
        {visible.map((lot) => {
          const draft = drafts[lot.id] ?? { start: String(lot.startingBid) };
          return (
            <article key={lot.id} className="comic-panel space-y-3 p-3">
              <div className="flex gap-3">
                <LotThumb lot={lot} size="h-20 w-20" />
                <div className="min-w-0">
                  <p className="break-words font-display text-xl leading-none">{lot.title}</p>
                  <p className="mt-1 font-comic text-sm">
                    {lot.auctionNumber} · {lot.lotNumber} · {(lot.status ?? "").toUpperCase()}
                    {lot.salePhase === "upcoming" ? " · UPCOMING" : ""}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 font-comic text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase">High paddle</dt>
                  <dd>{lot.highBidder || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase">Current bid</dt>
                  <dd className="font-bold">{formatCurrency(lot.currentBid)}</dd>
                  <dd>{bidState(lot)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs font-bold uppercase">Clock</dt>
                  <dd>
                    <LotTimer endsAt={lot.endsAt} />
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-end gap-2">
                <label className="font-comic text-sm">
                  Start
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={draft.start}
                    onChange={(e) => editStart(lot.id, e.target.value)}
                    className="mt-1 w-28 border-4 border-black bg-white px-2 py-1"
                  />
                </label>
                <button type="button" className="comic-btn-invert !text-sm" onClick={() => void savePricing(lot)}>
                  Save
                </button>
              </div>
              <button type="button" className="comic-btn w-full !text-sm" onClick={() => void openAudit(lot)}>
                Bid History Audit
              </button>
            </article>
          );
        })}
      </div>
      <div className="comic-table-wrap hidden xl:block">
        <table className="w-full border-collapse font-comic text-sm">
          <thead className="bg-[#FF0000] text-left text-white">
            <tr>
              <th className="border-b-4 border-black p-3">Lot</th>
              <th className="border-b-4 border-black p-3">High paddle</th>
              <th className="border-b-4 border-black p-3">Current bid</th>
              <th className="border-b-4 border-black p-3">Clock</th>
              <th className="border-b-4 border-black p-3">Modify start</th>
              <th className="border-b-4 border-black p-3">Audit</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr className="bg-[#FFF7D1]">
                <td className="p-4 font-comic" colSpan={6}>
                  {lots.length === 0
                    ? "No lots are live in this week's auction."
                    : "No lots match that search."}
                </td>
              </tr>
            ) : null}
            {visible.map((lot) => {
              const draft = drafts[lot.id] ?? {
                start: String(lot.startingBid),
              };
              return (
                <tr key={lot.id} className="bg-[#FFF7D1]">
                  <td className="border-b-2 border-black p-3">
                    <div className="flex items-start gap-3">
                      <LotThumb lot={lot} size="h-16 w-16" />
                      <div className="min-w-0">
                        <p className="font-display text-lg">{lot.title}</p>
                        <p>
                          {lot.auctionNumber} · {lot.lotNumber} · {(lot.status ?? "").toUpperCase()}
                          {lot.salePhase === "upcoming" ? " · UPCOMING" : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="border-b-2 border-black p-3">{lot.highBidder || "—"}</td>
                  <td className="border-b-2 border-black p-3 font-bold">
                    {formatCurrency(lot.currentBid)}
                    <span className="block font-normal">{bidState(lot)}</span>
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
                          min={0}
                          step="1"
                          value={draft.start}
                          onChange={(e) => editStart(lot.id, e.target.value)}
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
