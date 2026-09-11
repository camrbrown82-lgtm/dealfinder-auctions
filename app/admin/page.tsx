"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DropPhotos, UrlPaste } from "@/components/image-inputs";
import { HOUSE_COMMISSION, countdown, money, parseImageUrls, splitCommission } from "@/lib/catalog";
import { CATEGORIES } from "@/lib/types";
import type { AuctionEvent, Bid, EmailTemplate, Lot, PublicUser } from "@/lib/types";

type Tab = "monitor" | "email" | "inventory" | "scheduler" | "customers" | "payouts";

type AdminPayload = {
  source: string;
  lots: Lot[];
  events: AuctionEvent[];
  templates: EmailTemplate[];
  customers: PublicUser[];
  consignments: Lot[];
  payouts: { consignor: string; lots: number; hammer: number; house: number }[];
  payoutItems: { lotId: string; title: string; consignor: string; hammer: number; commissionRate: number; house: number; payout: number }[];
  suggestedLotNumber: string;
  emailLogo: string | null;
};

function datetimeLocal(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [tab, setTab] = useState<Tab>("monitor");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin");
    if (res.status === 401) {
      setUnlocked(false);
      setData(null);
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load admin");
      return;
    }
    setData(json);
    setUnlocked(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Login failed");
      return;
    }
    await load();
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setUnlocked(false);
    setData(null);
  }

  if (unlocked === null) return <p className="font-display text-4xl">Checking admin lock…</p>;

  if (!unlocked) {
    return (
      <form onSubmit={login} className="mx-auto max-w-md space-y-4 comic-panel bg-[#FFF7D1] p-6">
        <h1 className="font-display text-4xl">Admin lock</h1>
        <p className="font-comic text-sm">
          Staff only. Default demo password is <strong>hammer</strong> unless you set ADMIN_PASSWORD.
        </p>
        <label className="block font-comic font-bold">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="comic-input" />
        </label>
        {error && <p className="font-comic text-sm font-bold text-brand-red">{error}</p>}
        <button type="submit" className="comic-btn">
          Unlock
        </button>
      </form>
    );
  }

  if (!data) return <p className="font-display text-4xl">Failed to load admin</p>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "monitor", label: "Live monitor" },
    { id: "inventory", label: "Inventory & consignors" },
    { id: "scheduler", label: "Auction scheduler" },
    { id: "customers", label: "Customer management" },
    { id: "email", label: "Email engine" },
    { id: "payouts", label: "Final sales & consignor payouts" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-6xl">Admin Portal</h1>
          <p className="font-comic text-sm font-bold">{data.source}</p>
        </div>
        <button type="button" className="comic-btn-invert" onClick={() => void logout()}>
          Lock desk
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((row) => (
          <button key={row.id} type="button" className={tab === row.id ? "comic-btn !text-lg" : "comic-btn-invert !text-lg"} onClick={() => setTab(row.id)}>
            {row.label}
          </button>
        ))}
      </div>
      {(notice || error) && (
        <p className="border-4 border-black bg-white px-3 py-2 font-comic text-sm font-bold">{notice || error}</p>
      )}
      {tab === "monitor" && <Monitor lots={data.lots} onNotice={setNotice} onReload={load} />}
      {tab === "inventory" && (
        <Inventory
          data={data}
          onNotice={setNotice}
          onReload={load}
        />
      )}
      {tab === "scheduler" && <Scheduler events={data.events} onNotice={setNotice} onReload={load} />}
      {tab === "customers" && <Customers customers={data.customers} onNotice={setNotice} onReload={load} />}
      {tab === "email" && <EmailEngine templates={data.templates} logo={data.emailLogo} onNotice={setNotice} onReload={load} />}
      {tab === "payouts" && <Payouts payouts={data.payouts} items={data.payoutItems} />}
    </div>
  );
}

function Monitor({ lots, onNotice, onReload }: { lots: Lot[]; onNotice: (value: string) => void; onReload: () => Promise<void> }) {
  const live = lots.filter((lot) => lot.status === "live");
  const [audit, setAudit] = useState<{ title: string; bids: Bid[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function openAudit(lot: Lot) {
    const res = await fetch(`/api/admin/bids?lotId=${encodeURIComponent(lot.id)}`);
    const json = await res.json();
    setAudit({ title: lot.title, bids: json.bids ?? [] });
  }

  async function voidBid(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not void bid.");
      onNotice(`Bid voided. High is now ${money(json.currentBid)}`);
      await onReload();
      if (audit) {
        const next = await fetch(`/api/admin/bids?lotId=${encodeURIComponent(audit.bids[0]?.lotId || "")}`);
        const body = await next.json();
        setAudit({ ...audit, bids: body.bids ?? [] });
      }
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Could not void bid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-4xl">LIVE AUCTION MONITOR</h2>
      <p className="font-comic text-sm font-bold">Supabase is connected; otherwise this desk polls every 4s.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-4 border-black bg-white font-comic text-sm font-bold">
          <thead className="bg-black text-white">
            <tr>
              <th className="p-2 text-left">Lot</th>
              <th className="p-2 text-left">High paddle</th>
              <th className="p-2 text-left">Hammer</th>
              <th className="p-2 text-left">Clock</th>
              <th className="p-2 text-left">Audit</th>
            </tr>
          </thead>
          <tbody>
            {live.map((lot) => (
              <tr key={lot.id} className="border-t-4 border-black">
                <td className="p-2">
                  <p>{lot.title}</p>
                  <p className="text-xs">
                    {lot.auctionNumber} {lot.lotNumber} {(lot.status || "live").toUpperCase()}
                  </p>
                </td>
                <td className="p-2">{lot.highBidder || "—"}</td>
                <td className="p-2">
                  {money(lot.currentBid)} · {lot.bidCount} bids
                </td>
                <td className="p-2">{countdown(lot.endsAt)}</td>
                <td className="p-2">
                  <button type="button" className="comic-btn-invert !text-base" onClick={() => void openAudit(lot)}>
                    Bid History Audit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {audit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto comic-panel bg-[#FFF7D1] p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-3xl">BID HISTORY AUDIT · {audit.title}</h3>
              <button type="button" className="comic-btn-invert !text-base" onClick={() => setAudit(null)}>
                Close audit
              </button>
            </div>
            {audit.bids.length === 0 ? (
              <p className="mt-4 font-comic font-bold">No paddle attempts on this lot yet.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {audit.bids.map((bid) => (
                  <li key={bid.id} className="flex flex-wrap items-center justify-between gap-2 border-4 border-black bg-white p-2 font-comic text-sm font-bold">
                    <span>
                      {bid.bidder} {bid.email} · {money(bid.amount)} · {new Date(bid.createdAt).toLocaleString()}
                    </span>
                    <button type="button" className="comic-btn !text-base" disabled={busy || bid.voided} onClick={() => void voidBid(bid.id)}>
                      Void/Remove Bid
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Inventory({ data, onNotice, onReload }: { data: AdminPayload; onNotice: (value: string) => void; onReload: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const lots = data.lots.filter((lot) => {
    const t = query.toLowerCase();
    return (
      lot.title.toLowerCase().includes(t) ||
      lot.consignor.toLowerCase().includes(t) ||
      lot.lotNumber.toLowerCase().includes(t) ||
      (lot.auctionNumber || "").toLowerCase().includes(t)
    );
  });

  async function act(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Update failed");
    await onReload();
    return json;
  }

  return (
    <div className="space-y-8">
      <PostInventory events={data.events} suggestedLotNumber={data.suggestedLotNumber} onPosted={onReload} onNotice={onNotice} />
      <section>
        <h2 className="font-display text-4xl">Consignor review queue</h2>
        <div className="mt-3 grid gap-3">
          {data.consignments.map((lot) => (
            <article key={lot.id} className="comic-panel bg-white p-4">
              <p className="font-display text-3xl">{lot.title}</p>
              <p className="font-comic text-sm font-bold">
                {lot.consignor} · {lot.status.toUpperCase()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="comic-btn !text-lg" onClick={() => void act("approve", { id: lot.id }).then(() => onNotice(`Approved: ${lot.title}`))}>
                  Approve
                </button>
                <button type="button" className="comic-btn-invert !text-lg" onClick={() => void act("reject", { id: lot.id }).then(() => onNotice(`Rejected: ${lot.title}`))}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-4xl">Inventory management</h2>
          <button
            type="button"
            className="comic-btn-invert !text-lg"
            onClick={() => void act("seed", { count: 8 }).then((json) => onNotice(`Seeded ${json.added} house lots`))}
          >
            Bulk seed items
          </button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, consignor, lot #, auction #" className="comic-input mt-3" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-4 border-black bg-white font-comic text-sm font-bold">
            <thead className="bg-black text-white">
              <tr>
                <th className="p-2 text-left">Lot</th>
                <th className="p-2">Bid</th>
                <th className="p-2">Status</th>
                <th className="p-2">Event</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-t-4 border-black">
                  <td className="p-2">
                    {lot.title}
                    <div className="text-xs">
                      {lot.category} · {lot.consignor} · {lot.lotNumber}
                    </div>
                  </td>
                  <td className="p-2">{money(lot.currentBid)}</td>
                  <td className="p-2">{(lot.status || "draft").toUpperCase()}</td>
                  <td className="p-2">
                    <select
                      defaultValue={lot.auctionId}
                      className="border-4 border-black bg-white p-1"
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id) void act("assignEvent", { id: lot.id, auctionId: id }).then(() => onNotice(`Assigned ${lot.title}`));
                      }}
                    >
                      {data.events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="comic-btn !text-base" onClick={() => void act("goLive", { id: lot.id }).then(() => onNotice("Go live"))}>
                        Go live
                      </button>
                      <button type="button" className="comic-btn-invert !text-base" onClick={() => void act("remove", { id: lot.id }).then(() => onNotice(`Removed ${lot.title}`))}>
                        Removal of inventory
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PostInventory({
  events,
  suggestedLotNumber,
  onPosted,
  onNotice,
}: {
  events: AuctionEvent[];
  suggestedLotNumber: string;
  onPosted: () => Promise<void>;
  onNotice: (value: string) => void;
}) {
  const [consignor, setConsignor] = useState("House stock");
  const [files, setFiles] = useState<File[]>([]);
  const [urlPaste, setUrlPaste] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Oddities");
  const [lotNumber, setLotNumber] = useState(suggestedLotNumber);
  const [auctionId, setAuctionId] = useState(events[0]?.id ?? "");
  const [startingBid, setStartingBid] = useState("");
  const [reserve, setReserve] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [commission, setCommission] = useState("20");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const rate = Number(commission) / 100 || HOUSE_COMMISSION;
  const start = splitCommission(Number(startingBid) || 0, rate);
  const reserveSplit = splitCommission(Number(reserve) || 0, rate);

  useEffect(() => setLotNumber(suggestedLotNumber), [suggestedLotNumber]);

  async function save(goLive: boolean) {
    setBusy(true);
    try {
      let uploaded: string[] = [];
      if (files.length) {
        const body = new FormData();
        for (const file of files.slice(0, 4)) body.append("images", file);
        const up = await fetch("/api/consignment-images", { method: "POST", body });
        const upJson = await up.json();
        if (!up.ok) throw new Error(upJson.error || "Could not upload to consignment-images.");
        uploaded = upJson.urls ?? [];
      }
      const images = [...parseImageUrls(urlPaste), ...uploaded].slice(0, 4);
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createLot",
          consignor,
          title,
          description,
          category,
          lotNumber,
          auctionId,
          startingBid: Number(startingBid) || 0,
          reserve: Number(reserve) || 0,
          estimatedValue: Number(estimatedValue) || 0,
          commissionRate: rate,
          images,
          goLive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save lot.");
      onNotice(goLive ? `Post live to site · ${lotNumber}` : `Save to inventory · ${lotNumber}`);
      setTitle("");
      setDescription("");
      setFiles([]);
      setUrlPaste("");
      await onPosted();
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Could not save lot.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!files.length && !parseImageUrls(urlPaste).length) {
      onNotice("Add a photo or paste an image URL first.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/ai-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrls: parseImageUrls(urlPaste), titleHint: title }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI intake failed");
      setTitle(json.title ?? title);
      setDescription(String(json.description ?? description));
      if (json.category) setCategory(json.category);
      if (json.startingBid) setStartingBid(String(json.startingBid));
      if (json.reserve) setReserve(String(json.reserve));
      if (json.estimatedValue) setEstimatedValue(String(json.estimatedValue));
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "AI intake failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="comic-panel p-6">
      <h2 className="font-display text-4xl">Post inventory with AI</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="mt-4 space-y-3"
      >
        <label className="block font-comic text-sm font-bold">
          Consignor / house
          <input value={consignor} onChange={(e) => setConsignor(e.target.value)} required className="comic-input" />
        </label>
        <DropPhotos files={files} onChange={setFiles} />
        <UrlPaste value={urlPaste} onChange={setUrlPaste} />
        <button type="button" className="comic-btn-invert" disabled={generating} onClick={() => void generate()}>
          {generating ? "Generating…" : "Auto-Generate Details"}
        </button>
        <label className="block font-comic text-sm font-bold">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="comic-input">
            {CATEGORIES.filter((row) => row !== "All").map((row) => (
              <option key={row}>{row}</option>
            ))}
          </select>
        </label>
        <label className="block font-comic text-sm font-bold">
          Lot #
          <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} required className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Auction event
          <select value={auctionId} onChange={(e) => setAuctionId(e.target.value)} className="comic-input">
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.auctionNumber} {event.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block font-comic text-sm font-bold">
            Starting bid
            <input type="number" min={0} value={startingBid} onChange={(e) => setStartingBid(e.target.value)} required className="comic-input" />
          </label>
          <label className="block font-comic text-sm font-bold">
            Reserve
            <input type="number" min={0} value={reserve} onChange={(e) => setReserve(e.target.value)} required className="comic-input" />
          </label>
          <label className="block font-comic text-sm font-bold">
            Market value
            <input type="number" min={0} value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} className="comic-input" />
          </label>
          <label className="block font-comic text-sm font-bold">
            Commission %
            <input type="number" min={10} max={30} step={1} value={commission} onChange={(e) => setCommission(e.target.value)} className="comic-input" />
          </label>
        </div>
        <p className="font-comic text-sm font-bold">
          At starting bid · House {money(start.house)} · You {money(start.consignor)}
        </p>
        <p className="font-comic text-sm font-bold">
          At reserve · House {money(reserveSplit.house)} · You {money(reserveSplit.consignor)}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="comic-btn-invert" disabled={busy}>
            {busy ? "Working…" : "Save to inventory"}
          </button>
          <button type="button" className="comic-btn" disabled={busy} onClick={() => void save(true)}>
            Post live to site
          </button>
        </div>
      </form>
    </section>
  );
}

function Scheduler({ events, onNotice, onReload }: { events: AuctionEvent[]; onNotice: (value: string) => void; onReload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [auctionNumber, setAuctionNumber] = useState("AU-2026-002");
  const [startsAt, setStartsAt] = useState(datetimeLocal(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(datetimeLocal(new Date(Date.now() + 8.64e7).toISOString()));

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createEvent", name, auctionNumber, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }),
    });
    const json = await res.json();
    if (!res.ok) {
      onNotice(json.error || "Update failed");
      return;
    }
    onNotice(`Scheduled ${name}`);
    setName("");
    await onReload();
  }

  async function save(event: AuctionEvent) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateEvent", ...event }),
    });
    const json = await res.json();
    if (!res.ok) onNotice(json.error || "Update failed");
    else onNotice(`Saved auction ${event.auctionNumber}`);
    await onReload();
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-4xl">Auction scheduler</h2>
      <form onSubmit={create} className="comic-panel grid gap-3 p-6 sm:grid-cols-2">
        <label className="block font-comic text-sm font-bold">
          Event name
          <input value={name} onChange={(e) => setName(e.target.value)} required className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Auction number
          <input value={auctionNumber} onChange={(e) => setAuctionNumber(e.target.value)} required className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Starts
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Ends
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="comic-input" />
        </label>
        <button type="submit" className="comic-btn sm:col-span-2">
          Create auction event
        </button>
      </form>
      {events.map((event) => (
        <EventEditor key={event.id} event={event} onSave={save} />
      ))}
    </div>
  );
}

function EventEditor({ event, onSave }: { event: AuctionEvent; onSave: (event: AuctionEvent) => Promise<void> }) {
  const [draft, setDraft] = useState(event);
  return (
    <form
      className="comic-panel grid gap-3 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          ...draft,
          startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(),
        });
      }}
    >
      <label className="block font-comic text-sm font-bold">
        Event name
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="comic-input" />
      </label>
      <label className="block font-comic text-sm font-bold">
        Auction #
        <input value={draft.auctionNumber} onChange={(e) => setDraft({ ...draft, auctionNumber: e.target.value })} className="comic-input" />
      </label>
      <label className="block font-comic text-sm font-bold">
        Starts
        <input type="datetime-local" value={datetimeLocal(draft.startsAt)} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} className="comic-input" />
      </label>
      <label className="block font-comic text-sm font-bold">
        Ends
        <input type="datetime-local" value={datetimeLocal(draft.endsAt)} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} className="comic-input" />
      </label>
      <button type="submit" className="comic-btn sm:col-span-2">
        Save auction
      </button>
    </form>
  );
}

function Customers({ customers, onNotice, onReload }: { customers: PublicUser[]; onNotice: (value: string) => void; onReload: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const rows = customers.filter((row) => `${row.fullName} ${row.email}`.toLowerCase().includes(query.toLowerCase()));

  async function setStatus(id: string, status: "active" | "suspended") {
    const res = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (!res.ok) onNotice(json.error || "Could not update bidder.");
    else onNotice(status === "suspended" ? "Bidding privileges suspended." : "Paddle restored.");
    await onReload();
  }

  async function reset(user: PublicUser) {
    const res = await fetch("/api/admin/customers/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id }),
    });
    const json = await res.json();
    if (!res.ok) onNotice(json.error || "Could not send reset.");
    else onNotice(`Reset / alert queued for ${user.email}`);
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-4xl">Customer management</h2>
      <p className="font-comic text-sm font-bold">Suspended paddles are blocked on Place Bid. Reset queues a recovery alert.</p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="comic-input" />
      <div className="overflow-x-auto">
        <table className="w-full border-4 border-black bg-white font-comic text-sm font-bold">
          <thead className="bg-black text-white">
            <tr>
              <th className="p-2 text-left">Bidder</th>
              <th className="p-2">Status</th>
              <th className="p-2">Won</th>
              <th className="p-2">Lifetime spend</th>
              <th className="p-2">Payment flag</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t-4 border-black">
                <td className="p-2">
                  <p>{row.fullName || "Pat Paddle"}</p>
                  <p className="text-xs">{row.email}</p>
                </td>
                <td className="p-2">{row.status}</td>
                <td className="p-2">{row.auctionsWon}</td>
                <td className="p-2">{money(row.lifetimeSpend)}</td>
                <td className="p-2">{row.paymentFlag}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {row.status === "active" ? (
                      <button type="button" className="comic-btn !text-base" onClick={() => void setStatus(row.id, "suspended")}>
                        Suspend Bidding Privileges
                      </button>
                    ) : (
                      <button type="button" className="comic-btn-invert !text-base" onClick={() => void setStatus(row.id, "active")}>
                        Restore paddle
                      </button>
                    )}
                    <button type="button" className="comic-btn-invert !text-base" onClick={() => void reset(row)}>
                      Reset Password / Send Alert
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmailEngine({
  templates,
  logo,
  onNotice,
  onReload,
}: {
  templates: EmailTemplate[];
  logo: string | null;
  onNotice: (value: string) => void;
  onReload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(templates[0]?.id ?? "");
  const current = templates.find((row) => row.id === selected) ?? templates[0];
  const [draft, setDraft] = useState(current ?? { id: "", name: "", subject: "", body: "" });
  const [to, setTo] = useState("");
  const [customer, setCustomer] = useState("Pat Paddle");
  const [item, setItem] = useState("Silver Age Amazing #15 reprint folio");
  const [bid, setBid] = useState("CA$240");
  const [link, setLink] = useState("https://localhost:3001/checkout");
  const [newName, setNewName] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (current) setDraft(current);
  }, [current]);

  const preview = useMemo(() => {
    const body = draft.body
      .replaceAll("{{customer_name}}", customer)
      .replaceAll("{{item_title}}", item)
      .replaceAll("{{winning_bid}}", bid)
      .replaceAll("{{payment_link}}", link);
    return { subject: draft.subject.replaceAll("{{item_title}}", item), html: wrap(body, logo) };
  }, [draft, customer, item, bid, link, logo]);

  async function save() {
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = await res.json();
    if (!res.ok) onNotice(json.error || "Could not save template.");
    else onNotice(`Saved ${draft.name}`);
    await onReload();
  }

  async function addBlank() {
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim() || "New blank template",
        subject: "DealFinder Auctions",
        body: "{{logo}}\n\nHey {{customer_name}},\n\n",
      }),
    });
    const json = await res.json();
    if (!res.ok) onNotice(json.error || "Could not add template.");
    else {
      onNotice(`Added ${json.template?.name ?? newName}`);
      if (json.template?.id) setSelected(json.template.id);
    }
    setNewName("");
    await onReload();
  }

  async function send(previewOnly: boolean) {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: draft.id,
        to,
        customer_name: customer,
        item_title: item,
        winning_bid: bid,
        payment_link: link,
        previewOnly,
      }),
    });
    const json = await res.json();
    if (!res.ok) onNotice(json.error || "Send failed.");
    else if (json.mode === "resend") onNotice(`Sent ${json.subject} via Resend.`);
    else onNotice(`Queued ${json.subject} in demo outbox (set RESEND_API_KEY to deliver).`);
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    const body = new FormData();
    body.append("logo", file);
    const res = await fetch("/api/admin/email-logo", { method: "POST", body });
    if (!res.ok) onNotice("Could not save logo.");
    else onNotice("Email logo saved. PNG or JPEG shows in more inboxes than WebP.");
    await onReload();
  }

  async function resetLogo() {
    const res = await fetch("/api/admin/email-logo", { method: "DELETE" });
    if (!res.ok) onNotice("Could not reset logo.");
    else onNotice("Using the site logo from public/logo.webp.");
    await onReload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <h2 className="font-display text-4xl">Email engine</h2>
        <p className="font-comic text-sm font-bold">
          Merge tags: {"{{customer_name}}"} {"{{item_title}}"} {"{{winning_bid}}"} {"{{payment_link}}"}. Logo is inlined in every send. Paste HTML or import a file if you already have house templates.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="comic-btn-invert !text-lg" onClick={() => logoInput.current?.click()}>
            Upload logo
          </button>
          <button type="button" className="comic-btn-invert !text-lg" onClick={() => void resetLogo()}>
            Use site logo
          </button>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo || `/logo.webp?t=${Date.now()}`} alt="Email logo" className="mx-auto h-28 w-28 object-contain" />
        <p className="font-comic text-xs">Logo in emails. Upload a PNG or JPEG for better inbox support, or put {"{{logo}}"} in a custom HTML template.</p>
        <div className="flex flex-wrap gap-2">
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className={tpl.id === selected ? "comic-btn !text-base" : "comic-btn-invert !text-base"} onClick={() => setSelected(tpl.id)}>
              {tpl.name}
            </button>
          ))}
        </div>
        <label className="block font-comic text-sm font-bold">
          Template name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Subject
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          Body (plain text or HTML)
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12} className="comic-input" />
        </label>
        <div className="flex flex-wrap gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New blank template" className="comic-input !mt-0 flex-1" />
          <button type="button" className="comic-btn-invert !text-lg" onClick={() => void addBlank()}>
            New blank template
          </button>
          <button type="button" className="comic-btn-invert !text-lg" onClick={() => importInput.current?.click()}>
            Import HTML / TXT
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".html,.htm,.txt,text/html,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const name = file.name.replace(/\.(html?|txt)$/i, "").replace(/[_-]+/g, " ");
              setDraft({ ...draft, name: name || draft.name, body: text });
              onNotice("Imported template");
              e.target.value = "";
            }}
          />
          <button type="button" className="comic-btn" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="font-display text-3xl">Email preview</h3>
        <p className="font-comic text-sm font-bold">{preview.subject}</p>
        <iframe title="Email preview" className="h-[28rem] w-full border-4 border-black bg-white" srcDoc={preview.html} />
        <label className="block font-comic text-sm font-bold">
          To
          <input value={to} onChange={(e) => setTo(e.target.value)} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          customer_name
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          item_title
          <input value={item} onChange={(e) => setItem(e.target.value)} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          winning_bid
          <input value={bid} onChange={(e) => setBid(e.target.value)} className="comic-input" />
        </label>
        <label className="block font-comic text-sm font-bold">
          payment_link
          <input value={link} onChange={(e) => setLink(e.target.value)} className="comic-input" />
        </label>
        <div className="flex gap-2">
          <button type="button" className="comic-btn-invert" onClick={() => void send(true)}>
            Preview send
          </button>
          <button type="button" className="comic-btn" onClick={() => void send(false)}>
            Lot preview blast
          </button>
        </div>
      </div>
    </div>
  );
}

function wrap(body: string, logo: string | null) {
  const inner = /<\/?[a-z][\s\S]*>/i.test(body) ? body : body.replaceAll("\n", "<br/>");
  const logoHtml = logo
    ? `<img src="${logo}" alt="DealFinder Auctions" style="display:block;margin:0 auto;border:4px solid #000000;background:#000000;max-height:96px" />`
    : `<div style="text-align:center;padding:16px;background:#000000;color:#fff;font-weight:bold">DealFinder Auctions</div>`;
  return `<!DOCTYPE html><html><body style="margin:0;background:#FFF7D1;">${logoHtml}<div style="padding:24px;border:4px solid #000000;background:#FFF7D1;font-size:16px;line-height:1.5;">${inner}</div></body></html>`;
}

function Payouts({
  payouts,
  items,
}: {
  payouts: { consignor: string; lots: number; hammer: number; house: number }[];
  items: { lotId: string; title: string; consignor: string; hammer: number; commissionRate: number; house: number; payout: number }[];
}) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-4xl">Final sales & consignor payouts</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-4 border-black bg-white font-comic text-sm font-bold">
          <thead className="bg-black text-white">
            <tr>
              <th className="p-2 text-left">Consignor</th>
              <th className="p-2">Lots</th>
              <th className="p-2">Hammer</th>
              <th className="p-2">House</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((row) => (
              <tr key={row.consignor} className="border-t-4 border-black">
                <td className="p-2">{row.consignor}</td>
                <td className="p-2">{row.lots}</td>
                <td className="p-2">{money(row.hammer)}</td>
                <td className="p-2">{money(row.house)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-4 border-black bg-white font-comic text-sm font-bold">
          <thead className="bg-black text-white">
            <tr>
              <th className="p-2 text-left">Lot</th>
              <th className="p-2">Hammer</th>
              <th className="p-2">Commission</th>
              <th className="p-2">Payout</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.lotId} className="border-t-4 border-black">
                <td className="p-2">{row.title}</td>
                <td className="p-2">{money(row.hammer)}</td>
                <td className="p-2">
                  {Math.round(100 * row.commissionRate)}% · {money(row.house)}
                </td>
                <td className="p-2">{money(row.payout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
