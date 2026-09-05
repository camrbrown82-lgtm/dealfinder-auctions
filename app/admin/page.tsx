"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminAiIntake } from "@/components/AdminAiIntake";
import { CustomerDesk } from "@/components/admin/CustomerDesk";
import { EmailEngine } from "@/components/admin/EmailEngine";
import { LiveMonitor } from "@/components/admin/LiveMonitor";
import {
  formatCurrency,
  type AuctionEvent,
  type AuctionLot,
  type Consignment,
  type PayoutRow,
} from "@/lib/utils";
import type { PayoutItem } from "@/lib/payouts";

type AdminPayload = {
  source: "demo" | "supabase";
  queue: Consignment[];
  inventory: AuctionLot[];
  events: AuctionEvent[];
  payouts: PayoutRow[];
  payoutItems?: PayoutItem[];
  suggestedLotNumber?: string;
  suggestedAuctionNumber?: string;
};

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [eventName, setEventName] = useState("Saturday BAM Blowout");
  const [eventNumber, setEventNumber] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventEdits, setEventEdits] = useState<
    Record<string, { name: string; auctionNumber: string; startsAt: string; endsAt: string }>
  >({});
  const [lotEdits, setLotEdits] = useState<
    Record<string, { title: string; description: string; lotNumber: string }>
  >({});
  const [drafts, setDrafts] = useState<
    Record<string, { title: string; description: string; startingBid: string }>
  >({});
  const [tab, setTab] = useState<"monitor" | "customers" | "email" | "inventory">("monitor");

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
    const next: typeof drafts = {};
    for (const item of json.queue as Consignment[]) {
      next[item.id] = {
        title: item.title,
        description: item.description ?? "",
        startingBid: String(item.startingBid ?? 0),
      };
    }
    setDrafts(next);
    const events: typeof eventEdits = {};
    for (const event of json.events as AuctionEvent[]) {
      events[event.id] = {
        name: event.name,
        auctionNumber: event.auctionNumber ?? "",
        startsAt: toLocalInput(event.startsAt),
        endsAt: toLocalInput(event.endsAt),
      };
    }
    setEventEdits(events);
    const lots: typeof lotEdits = {};
    for (const lot of json.inventory as AuctionLot[]) {
      lots[lot.id] = {
        title: lot.title,
        description: lot.description,
        lotNumber: lot.lotNumber ?? "",
      };
    }
    setLotEdits(lots);
    if (json.suggestedAuctionNumber && !eventNumber) {
      setEventNumber(json.suggestedAuctionNumber);
    }
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
    return json;
  }

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.inventory ?? [];
    if (!q) return list;
    return list.filter(
      (lot) =>
        lot.title.toLowerCase().includes(q) ||
        lot.consignor.toLowerCase().includes(q) ||
        lot.category.toLowerCase().includes(q) ||
        (lot.lotNumber ?? "").toLowerCase().includes(q) ||
        (lot.auctionNumber ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

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
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl">Operations command center</h1>
          <p className="font-comic text-sm">Source: {data.source}</p>
        </div>
        <button type="button" className="comic-btn-invert" onClick={() => void logout()}>
          Log out
        </button>
      </div>

      {error && (
        <p className="border-4 border-black bg-brand-red p-4 font-display text-xl text-white">
          {error}
        </p>
      )}
      {notice && (
        <p className="border-4 border-black bg-[#FFF7D1] p-4 font-display text-xl">{notice}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["monitor", "Live monitor"],
            ["customers", "Customers"],
            ["email", "Email engine"],
            ["inventory", "Inventory & consignors"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "comic-btn" : "comic-btn-invert"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "monitor" && <LiveMonitor onNotice={setNotice} />}
      {tab === "customers" && <CustomerDesk onNotice={setNotice} />}
      {tab === "email" && <EmailEngine onNotice={setNotice} />}
      {tab === "inventory" && (
        <div className="space-y-10">
      <AdminAiIntake
        events={data.events}
        suggestedLotNumber={data.suggestedLotNumber ?? "LOT-0001"}
        onPosted={async (message) => {
          await load();
          setNotice(message);
        }}
      />

      <section className="space-y-4">
        <h2 className="font-display text-3xl">Consignor review queue</h2>
        <p className="font-comic text-sm">
          Edit AI titles, copy, and starting bids, then approve onto inventory.
        </p>
        <div className="space-y-4">
          {data.queue.map((item) => {
            const draft = drafts[item.id] ?? {
              title: item.title,
              description: item.description ?? "",
              startingBid: String(item.startingBid ?? 0),
            };
            return (
              <article
                key={item.id}
                className="space-y-3 border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000]"
              >
                <p className="font-display text-sm tracking-widest text-brand-red">
                  {item.consignor} · {item.status.toUpperCase()}
                </p>
                <label className="block font-comic text-sm font-bold">
                  Title
                  <input
                    value={draft.title}
                    onChange={(e) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draft, title: e.target.value },
                      }))
                    }
                    className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                  />
                </label>
                <label className="block font-comic text-sm font-bold">
                  Description
                  <textarea
                    value={draft.description}
                    onChange={(e) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draft, description: e.target.value },
                      }))
                    }
                    rows={3}
                    className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
                  />
                </label>
                <label className="block font-comic text-sm font-bold">
                  Starting bid ($)
                  <input
                    type="number"
                    min={0}
                    value={draft.startingBid}
                    onChange={(e) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draft, startingBid: e.target.value },
                      }))
                    }
                    className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="comic-btn !text-base"
                    onClick={() =>
                      void mutate("/api/admin", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          entity: "consignment",
                          id: item.id,
                          status: "approved",
                          title: draft.title,
                          description: draft.description,
                          startingBid: Number(draft.startingBid) || 0,
                        }),
                      }).then(() => setNotice(`Approved: ${draft.title}`))
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="comic-btn-invert !text-base"
                    onClick={() =>
                      void mutate("/api/admin", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          entity: "consignment",
                          id: item.id,
                          status: "held",
                          title: draft.title,
                          description: draft.description,
                          startingBid: Number(draft.startingBid) || 0,
                        }),
                      })
                    }
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    className="comic-btn !text-base"
                    onClick={() =>
                      void mutate("/api/admin", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          entity: "consignment",
                          id: item.id,
                          status: "rejected",
                          title: draft.title,
                          description: draft.description,
                          startingBid: Number(draft.startingBid) || 0,
                        }),
                      }).then(() => setNotice(`Rejected: ${draft.title}`))
                    }
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl">Auction scheduler</h2>
        <form
          className="grid gap-3 border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000] sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate("/api/admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "createEvent",
                name: eventName,
                auctionNumber: eventNumber,
                startsAt: new Date(eventStart).toISOString(),
                endsAt: new Date(eventEnd).toISOString(),
              }),
            }).then(() => setNotice(`Scheduled ${eventName}`));
          }}
        >
          <label className="block font-comic font-bold sm:col-span-2">
            Event name
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              required
            />
          </label>
          <label className="block font-comic font-bold sm:col-span-2">
            Auction number
            <input
              value={eventNumber}
              onChange={(e) => setEventNumber(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              placeholder={data.suggestedAuctionNumber ?? "AU-2026-001"}
            />
          </label>
          <label className="block font-comic font-bold">
            Start
            <input
              type="datetime-local"
              value={eventStart}
              onChange={(e) => setEventStart(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              required
            />
          </label>
          <label className="block font-comic font-bold">
            End
            <input
              type="datetime-local"
              value={eventEnd}
              onChange={(e) => setEventEnd(e.target.value)}
              className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
              required
            />
          </label>
          <button type="submit" className="comic-btn sm:col-span-2">
            Create auction event
          </button>
        </form>
        <ul className="space-y-2">
          {data.events.map((event) => {
            const edit = eventEdits[event.id] ?? {
              name: event.name,
              auctionNumber: event.auctionNumber ?? "",
              startsAt: toLocalInput(event.startsAt),
              endsAt: toLocalInput(event.endsAt),
            };
            return (
              <li key={event.id} className="space-y-2 border-4 border-black bg-white p-3 font-comic">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Name
                    <input
                      value={edit.name}
                      onChange={(e) =>
                        setEventEdits((current) => ({
                          ...current,
                          [event.id]: { ...edit, name: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Auction #
                    <input
                      value={edit.auctionNumber}
                      onChange={(e) =>
                        setEventEdits((current) => ({
                          ...current,
                          [event.id]: { ...edit, auctionNumber: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Start
                    <input
                      type="datetime-local"
                      value={edit.startsAt}
                      onChange={(e) =>
                        setEventEdits((current) => ({
                          ...current,
                          [event.id]: { ...edit, startsAt: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    End
                    <input
                      type="datetime-local"
                      value={edit.endsAt}
                      onChange={(e) =>
                        setEventEdits((current) => ({
                          ...current,
                          [event.id]: { ...edit, endsAt: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border-4 border-black px-2 py-1 font-normal"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="comic-btn-invert !text-base"
                  onClick={() =>
                    void mutate("/api/admin", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        entity: "event",
                        id: event.id,
                        name: edit.name,
                        auctionNumber: edit.auctionNumber,
                        startsAt: new Date(edit.startsAt).toISOString(),
                        endsAt: new Date(edit.endsAt).toISOString(),
                      }),
                    }).then(() => setNotice(`Saved auction ${edit.auctionNumber || edit.name}`))
                  }
                >
                  Save auction
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl">Inventory management</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, consignor, lot #, auction #"
            className="min-w-[220px] flex-1 border-4 border-black bg-white px-3 py-2 font-comic"
          />
          <button
            type="button"
            className="comic-btn"
            onClick={() =>
              void mutate("/api/admin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "seed" }),
              }).then((json) => setNotice(`Seeded ${json?.seeded ?? 3} house lots`))
            }
          >
            Bulk seed items
          </button>
        </div>
        <ul className="space-y-3">
          {filteredInventory.map((lot) => {
            const edit = lotEdits[lot.id] ?? {
              title: lot.title,
              description: lot.description,
              lotNumber: lot.lotNumber ?? "",
            };
            return (
            <li
              key={lot.id}
              className="flex flex-col gap-3 border-4 border-black bg-[#FFF7D1] p-4 shadow-[4px_4px_0_0_#000]"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block font-comic text-sm font-bold">
                  Title
                  <input
                    value={edit.title}
                    onChange={(e) =>
                      setLotEdits((current) => ({
                        ...current,
                        [lot.id]: { ...edit, title: e.target.value },
                      }))
                    }
                    className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
                  />
                </label>
                <label className="block font-comic text-sm font-bold">
                  Lot #
                  <input
                    value={edit.lotNumber}
                    onChange={(e) =>
                      setLotEdits((current) => ({
                        ...current,
                        [lot.id]: { ...edit, lotNumber: e.target.value },
                      }))
                    }
                    className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
                  />
                </label>
                <label className="block font-comic text-sm font-bold sm:col-span-2">
                  Description
                  <textarea
                    value={edit.description}
                    onChange={(e) =>
                      setLotEdits((current) => ({
                        ...current,
                        [lot.id]: { ...edit, description: e.target.value },
                      }))
                    }
                    rows={2}
                    className="mt-1 w-full border-4 border-black bg-white px-2 py-1 font-normal"
                  />
                </label>
              </div>
              <p className="font-comic text-sm">
                {lot.consignor} · {lot.category} · {formatCurrency(lot.currentBid)} ·{" "}
                {(lot.status ?? "live").toUpperCase()}
                {lot.auctionNumber ? ` · Auction ${lot.auctionNumber}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="comic-btn-invert !text-base"
                  onClick={() =>
                    void mutate("/api/admin", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        entity: "lot",
                        id: lot.id,
                        title: edit.title,
                        description: edit.description,
                        lotNumber: edit.lotNumber,
                      }),
                    }).then(() => setNotice(`Saved ${edit.lotNumber || edit.title}`))
                  }
                >
                  Save lot
                </button>
                <select
                  className="border-4 border-black bg-white px-2 py-1 font-comic text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const eventId = e.target.value;
                    if (!eventId) return;
                    void mutate("/api/admin", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ entity: "lot", id: lot.id, eventId }),
                    }).then(() => setNotice(`Assigned ${lot.title}`));
                  }}
                >
                  <option value="">Assign to event…</option>
                  {data.events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="comic-btn-invert !text-base"
                  onClick={() =>
                    void mutate("/api/admin", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        entity: "lot",
                        id: lot.id,
                        status: lot.status === "live" ? "paused" : "live",
                      }),
                    })
                  }
                >
                  {lot.status === "live" ? "Pause" : "Go live"}
                </button>
                <button
                  type="button"
                  className="comic-btn !text-base"
                  onClick={() =>
                    void mutate("/api/admin", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ entity: "lot", id: lot.id, remove: true }),
                    }).then(() => setNotice(`Removed ${lot.title}`))
                  }
                >
                  Removal of inventory
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl">Final sales & consignor payouts</h2>
        <p className="font-comic text-sm">
          House take {Math.round(0.2 * 100)}% · hammer on live lots is in-flight; ended lots are
          settled.
        </p>
        <div className="overflow-x-auto border-4 border-black shadow-[6px_6px_0_0_#000]">
          <table className="w-full min-w-[640px] border-collapse font-comic">
            <thead className="bg-brand-red text-left text-white">
              <tr>
                <th className="border-b-4 border-black p-3">Consignor</th>
                <th className="border-b-4 border-black p-3">Lots</th>
                <th className="border-b-4 border-black p-3">Hammer</th>
                <th className="border-b-4 border-black p-3">House</th>
                <th className="border-b-4 border-black p-3">Payout</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((row) => (
                <tr key={row.consignor} className="bg-[#FFF7D1]">
                  <td className="border-b-2 border-black p-3">{row.consignor}</td>
                  <td className="border-b-2 border-black p-3">{row.lots}</td>
                  <td className="border-b-2 border-black p-3">{formatCurrency(row.hammer)}</td>
                  <td className="border-b-2 border-black p-3">{formatCurrency(row.house)}</td>
                  <td className="border-b-2 border-black p-3 font-bold">
                    {formatCurrency(row.payout)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(data.payoutItems ?? []).length > 0 && (
          <div className="overflow-x-auto border-4 border-black shadow-[6px_6px_0_0_#000]">
            <p className="border-b-4 border-black bg-black p-2 font-display text-xl text-white">
              By item (hammer − commission)
            </p>
            <table className="w-full min-w-[720px] border-collapse font-comic text-sm">
              <thead className="bg-[#FF0000] text-left text-white">
                <tr>
                  <th className="border-b-4 border-black p-3">Item</th>
                  <th className="border-b-4 border-black p-3">Consignor</th>
                  <th className="border-b-4 border-black p-3">Hammer</th>
                  <th className="border-b-4 border-black p-3">Commission</th>
                  <th className="border-b-4 border-black p-3">Payout</th>
                </tr>
              </thead>
              <tbody>
                {data.payoutItems?.map((row) => (
                  <tr key={row.lotId} className="bg-[#FFF7D1]">
                    <td className="border-b-2 border-black p-3">{row.title}</td>
                    <td className="border-b-2 border-black p-3">{row.consignor}</td>
                    <td className="border-b-2 border-black p-3">{formatCurrency(row.hammer)}</td>
                    <td className="border-b-2 border-black p-3">
                      {Math.round(row.commissionRate * 100)}% · {formatCurrency(row.house)}
                    </td>
                    <td className="border-b-2 border-black p-3 font-bold">
                      {formatCurrency(row.payout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </div>
      )}
    </div>
  );
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
