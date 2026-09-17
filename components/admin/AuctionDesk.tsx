"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuctionTermsFields } from "@/components/admin/AuctionTermsFields";
import type { AuctionDeskPayload } from "@/lib/auctionDesk";
import { groupDeskSales } from "@/lib/auctionDesk";
import { salesViewLabel, type SalesViewMode } from "@/lib/salesView";
import { parseTcTemplateType, resolvedAuctionTerms, termsTextFor, type TcTemplateType } from "@/lib/tcTemplates";
import { formatCurrency } from "@/lib/utils";

const EMPTY: AuctionDeskPayload = {
  events: [],
  event: null,
  stats: {
    lots: 0,
    live: 0,
    sold: 0,
    unsold: 0,
    hammer: 0,
    bidders: 0,
    registered: 0,
    preauthHeld: 0,
    preauthDenied: 0,
    preauthNone: 0,
    paidLots: 0,
  },
  lots: [],
  bids: [],
  registrations: [],
  sales: [],
};

function preauthLabel(status: string) {
  if (status === "held") return "Held";
  if (status === "denied") return "Denied";
  if (status === "released") return "Released";
  return "None";
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyCreate() {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    name: "",
    auctionNumber: "",
    startsAt: toLocalInput(start.toISOString()),
    endsAt: toLocalInput(end.toISOString()),
    templateType: "standard" as TcTemplateType,
    termsText: termsTextFor("standard"),
  };
}

export function AuctionDesk() {
  const [eventId, setEventId] = useState("");
  const [query, setQuery] = useState("");
  const [desk, setDesk] = useState<AuctionDeskPayload>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [salesView, setSalesView] = useState<SalesViewMode>("grouped");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyCreate);
  const [edit, setEdit] = useState({
    name: "",
    auctionNumber: "",
    startsAt: "",
    endsAt: "",
    templateType: "standard" as TcTemplateType,
    termsText: termsTextFor("standard"),
  });

  const load = useCallback(async (id: string, search: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (id) params.set("eventId", id);
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/admin/auctions?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await response.json()) as AuctionDeskPayload & { error?: string };
      if (!response.ok) throw new Error(json.error || "Could not load auction.");
      setDesk(json);
      if (json.event?.id && json.event.id !== id) setEventId(json.event.id);
      if (json.event) {
        setEdit({
          name: json.event.name,
          auctionNumber: json.event.auctionNumber ?? "",
          startsAt: toLocalInput(json.event.startsAt),
          endsAt: toLocalInput(json.event.endsAt),
          templateType: parseTcTemplateType(json.event.tcTemplateType),
          termsText: resolvedAuctionTerms(json.event),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load auction.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load(eventId, query);
    }, query ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [query, eventId, load]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (query.trim()) params.set("q", query.trim());
    params.set("view", salesView);
    return `/api/admin/export?${params.toString()}`;
  }, [eventId, query, salesView]);

  async function adminJson(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin", {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { error?: string; event?: { id: string } };
      if (!response.ok) throw new Error(json.error || "Request failed.");
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function createAuction() {
    if (!draft.name.trim()) {
      setError("Name is required to create an auction.");
      return;
    }
    try {
      const json = await adminJson("POST", {
        action: "createEvent",
        name: draft.name.trim(),
        auctionNumber: draft.auctionNumber.trim(),
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        tcTemplateType: draft.templateType,
        termsAndConditions: draft.termsText,
      });
      setCreating(false);
      setDraft(emptyCreate());
      setNotice(`Created ${draft.auctionNumber || draft.name}`);
      if (json.event?.id) setEventId(json.event.id);
      else await load(eventId, query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create auction.");
    }
  }

  async function saveAuction() {
    if (!eventId) return;
    try {
      await adminJson("PATCH", {
        entity: "event",
        id: eventId,
        name: edit.name,
        auctionNumber: edit.auctionNumber,
        startsAt: new Date(edit.startsAt).toISOString(),
        endsAt: new Date(edit.endsAt).toISOString(),
        tcTemplateType: edit.templateType,
        termsAndConditions: edit.termsText,
      });
      setNotice(`Saved ${edit.auctionNumber || edit.name}`);
      await load(eventId, query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save auction.");
    }
  }

  async function deleteAuction() {
    if (!eventId || !desk.event) return;
    const label = desk.event.auctionNumber || desk.event.name;
    if (!window.confirm(`Delete ${label}? Lots in this sale go back to warehouse.`)) return;
    try {
      await adminJson("POST", { action: "deleteEvent", id: eventId });
      setNotice(`Deleted ${label}`);
      setEventId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete auction.");
    }
  }

  const groupedSales = useMemo(() => groupDeskSales(desk.sales), [desk.sales]);
  const stats = [
    ["Lots", String(desk.stats.lots)],
    ["Live", String(desk.stats.live)],
    ["Sold", String(desk.stats.sold)],
    ["Hammer", formatCurrency(desk.stats.hammer)],
    ["Bidders", String(desk.stats.bidders)],
    ["Registered", String(desk.stats.registered)],
    ["$50 held", String(desk.stats.preauthHeld)],
    ["Hold denied", String(desk.stats.preauthDenied)],
    ["Paid lots", String(desk.stats.paidLots)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="min-w-[220px] flex-1 font-comic text-sm font-bold">
          Auction
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          >
            {desk.events.length === 0 ? <option value="">No auctions</option> : null}
            {desk.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.auctionNumber ?? event.id} · {event.name}
                {event.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[220px] flex-[2] font-comic text-sm font-bold">
          Search this auction
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bidder, item, or lot #"
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <a className="comic-btn-invert" href={exportHref}>
          Export {salesViewLabel(salesView)}
        </a>
        <button
          type="button"
          className="comic-btn"
          onClick={() => {
            setCreating((open) => !open);
            setDraft(emptyCreate());
          }}
        >
          {creating ? "Cancel create" : "Create auction"}
        </button>
        <button
          type="button"
          className="comic-btn-invert"
          disabled={!eventId || busy}
          onClick={() => void deleteAuction()}
        >
          Delete auction
        </button>
      </div>

      {notice ? <p className="comic-panel p-3 font-comic text-sm">{notice}</p> : null}

      {creating ? (
        <section className="comic-panel space-y-3 p-4">
          <h2 className="font-display text-3xl">New auction</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block font-comic text-sm font-bold">
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
            <label className="block font-comic text-sm font-bold">
              Auction #
              <input
                value={draft.auctionNumber}
                onChange={(e) => setDraft((current) => ({ ...current, auctionNumber: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
            <label className="block font-comic text-sm font-bold">
              Start
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft((current) => ({ ...current, startsAt: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
            <label className="block font-comic text-sm font-bold">
              End
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft((current) => ({ ...current, endsAt: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
          </div>
          <AuctionTermsFields
            idPrefix="create-tc"
            templateType={draft.templateType}
            termsText={draft.termsText}
            onChange={(next) =>
              setDraft((current) => ({
                ...current,
                templateType: next.templateType,
                termsText: next.termsText,
              }))
            }
          />
          <button type="button" className="comic-btn" disabled={busy} onClick={() => void createAuction()}>
            {busy ? "Saving…" : "Save new auction"}
          </button>
        </section>
      ) : null}

      {desk.event ? (
        <section className="comic-panel space-y-3 p-4">
          <h2 className="font-display text-3xl">Auction settings</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block font-comic text-sm font-bold">
              Name
              <input
                value={edit.name}
                onChange={(e) => setEdit((current) => ({ ...current, name: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
            <label className="block font-comic text-sm font-bold">
              Auction #
              <input
                value={edit.auctionNumber}
                onChange={(e) => setEdit((current) => ({ ...current, auctionNumber: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
            <label className="block font-comic text-sm font-bold">
              Start
              <input
                type="datetime-local"
                value={edit.startsAt}
                onChange={(e) => setEdit((current) => ({ ...current, startsAt: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
            <label className="block font-comic text-sm font-bold">
              End
              <input
                type="datetime-local"
                value={edit.endsAt}
                onChange={(e) => setEdit((current) => ({ ...current, endsAt: e.target.value }))}
                className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
              />
            </label>
          </div>
          <AuctionTermsFields
            idPrefix="edit-tc"
            templateType={edit.templateType}
            termsText={edit.termsText}
            onChange={(next) =>
              setEdit((current) => ({
                ...current,
                templateType: next.templateType,
                termsText: next.termsText,
              }))
            }
          />
          <button type="button" className="comic-btn" disabled={busy} onClick={() => void saveAuction()}>
            {busy ? "Saving…" : "Save auction & terms"}
          </button>
        </section>
      ) : null}

      {error ? (
        <p className="border-4 border-black bg-brand-red p-4 font-comic text-white">{error}</p>
      ) : null}

      {desk.event ? (
        <p className="font-comic text-sm">
          {desk.event.auctionNumber} · {desk.event.name} · ends{" "}
          {new Date(desk.event.endsAt).toLocaleString()}
          {loading ? " · Refreshing…" : ""}
        </p>
      ) : (
        <p className="font-comic text-sm">Pick an auction to see its desk.</p>
      )}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="comic-panel-sm p-3">
            <p className="font-comic text-xs uppercase tracking-wide">{label}</p>
            <p className="font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-3xl">Registered pre-auth</h2>
        {desk.registrations.length === 0 ? (
          <p className="comic-panel-sm p-3 font-comic text-sm">
            No bidders have agreed to this auction&apos;s terms and Sunday $50 hold yet.
          </p>
        ) : (
          <div className="comic-table-wrap">
            <table className="w-full min-w-[720px] border-collapse font-comic text-sm">
              <thead className="bg-brand-red text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">Bidder</th>
                  <th className="border-b-4 border-black p-3">Email</th>
                  <th className="border-b-4 border-black p-3">Terms</th>
                  <th className="border-b-4 border-black p-3">$50 hold</th>
                  <th className="border-b-4 border-black p-3">Card</th>
                </tr>
              </thead>
              <tbody>
                {desk.registrations.map((row) => (
                  <tr key={row.userId} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-3">{row.name}</td>
                    <td className="border-b-2 border-black p-3">{row.email}</td>
                    <td className="border-b-2 border-black p-3">
                      {new Date(row.termsAgreedAt).toLocaleString()}
                    </td>
                    <td className="border-b-2 border-black p-3">{preauthLabel(row.preauthStatus)}</td>
                    <td className="border-b-2 border-black p-3">{row.hasCardOnFile ? "On file" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-3xl">Bids</h2>
        {desk.bids.length === 0 ? (
          <p className="comic-panel-sm p-3 font-comic text-sm">No paddles on this sale yet.</p>
        ) : (
          <div className="comic-table-wrap">
            <table className="w-full min-w-[720px] border-collapse font-comic text-sm">
              <thead className="bg-black text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">When</th>
                  <th className="border-b-4 border-black p-3">Lot</th>
                  <th className="border-b-4 border-black p-3">Item</th>
                  <th className="border-b-4 border-black p-3">Bidder</th>
                  <th className="border-b-4 border-black p-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {desk.bids.map((bid) => (
                  <tr key={bid.id} className="bg-white">
                    <td className="border-b-2 border-black p-3">
                      {new Date(bid.createdAt).toLocaleString()}
                    </td>
                    <td className="border-b-2 border-black p-3">{bid.lotNumber || "—"}</td>
                    <td className="border-b-2 border-black p-3">{bid.lotTitle}</td>
                    <td className="border-b-2 border-black p-3">
                      {bid.bidder}
                      {bid.email ? ` · ${bid.email}` : ""}
                    </td>
                    <td className="border-b-2 border-black p-3">{formatCurrency(bid.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-3xl">Completed sales</h2>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              className={salesView === "itemized" ? "comic-btn" : "comic-btn-invert"}
              onClick={() => setSalesView("itemized")}
            >
              Itemized Sales View
            </button>
            <button
              type="button"
              className={salesView === "grouped" ? "comic-btn" : "comic-btn-invert"}
              onClick={() => setSalesView("grouped")}
            >
              Grouped Buyer Invoice View
            </button>
          </div>
        </div>
        {desk.sales.length === 0 ? (
          <p className="comic-panel-sm p-3 font-comic text-sm">No sold lots in this auction yet.</p>
        ) : salesView === "grouped" ? (
          <div className="comic-table-wrap">
            <table className="w-full min-w-[800px] border-collapse font-comic text-sm">
              <thead className="bg-brand-red text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">Invoice</th>
                  <th className="border-b-4 border-black p-3">Buyer</th>
                  <th className="border-b-4 border-black p-3">Lots</th>
                  <th className="border-b-4 border-black p-3">Items</th>
                  <th className="border-b-4 border-black p-3">Invoice total</th>
                  <th className="border-b-4 border-black p-3">Payment</th>
                  <th className="border-b-4 border-black p-3">Pre-auth</th>
                </tr>
              </thead>
              <tbody>
                {groupedSales.map((row) => (
                  <tr key={row.invoice} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-3">{row.invoice}</td>
                    <td className="border-b-2 border-black p-3">
                      {row.buyerName}
                      {row.buyerEmail ? ` · ${row.buyerEmail}` : ""}
                    </td>
                    <td className="border-b-2 border-black p-3">{row.lotSummary}</td>
                    <td className="border-b-2 border-black p-3">{row.itemCount}</td>
                    <td className="border-b-2 border-black p-3">{formatCurrency(row.hammer)}</td>
                    <td className="border-b-2 border-black p-3">{row.paymentStatus}</td>
                    <td className="border-b-2 border-black p-3">{preauthLabel(row.buyerPreauthStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="comic-table-wrap">
            <table className="w-full min-w-[800px] border-collapse font-comic text-sm">
              <thead className="bg-brand-red text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">Invoice</th>
                  <th className="border-b-4 border-black p-3">Lot</th>
                  <th className="border-b-4 border-black p-3">Item</th>
                  <th className="border-b-4 border-black p-3">Buyer</th>
                  <th className="border-b-4 border-black p-3">Hammer</th>
                  <th className="border-b-4 border-black p-3">Payment</th>
                  <th className="border-b-4 border-black p-3">Pre-auth</th>
                </tr>
              </thead>
              <tbody>
                {desk.sales.map((row) => (
                  <tr key={`${row.invoice}-${row.lotId}`} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-3">{row.invoice}</td>
                    <td className="border-b-2 border-black p-3">{row.lotNumber || "—"}</td>
                    <td className="border-b-2 border-black p-3">{row.title}</td>
                    <td className="border-b-2 border-black p-3">
                      {row.buyerName}
                      {row.buyerEmail ? ` · ${row.buyerEmail}` : ""}
                    </td>
                    <td className="border-b-2 border-black p-3">{formatCurrency(row.hammer)}</td>
                    <td className="border-b-2 border-black p-3">{row.paymentStatus}</td>
                    <td className="border-b-2 border-black p-3">{preauthLabel(row.buyerPreauthStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
