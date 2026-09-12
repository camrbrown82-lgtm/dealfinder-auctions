"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminDesk, type AdminDeskApi } from "@/components/admin/AdminDesk";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { AuctionInventories } from "@/components/admin/AuctionInventories";
import { OwnerPicker } from "@/components/OwnerPicker";
import { CustomerDesk } from "@/components/admin/CustomerDesk";
import { EmailEngine } from "@/components/admin/EmailEngine";
import { LiveMonitor } from "@/components/admin/LiveMonitor";
import { LotImage } from "@/components/LotImage";
import { weeklySaleName, weeklySaleTimes } from "@/lib/auctionCalendar";
import { formatCurrency, type Consignment } from "@/lib/utils";

export default function AdminPage() {
  return (
    <AdminDesk>
      {(desk) => <AdminDeskHome desk={desk} />}
    </AdminDesk>
  );
}

function AdminDeskHome({ desk }: { desk: AdminDeskApi }) {
  const { data, error, notice, setNotice, mutate, logout } = desk;
  const [search, setSearch] = useState("");
  const [eventEdits, setEventEdits] = useState<
    Record<string, { name: string; auctionNumber: string; startsAt: string; endsAt: string }>
  >({});
  const [drafts, setDrafts] = useState<
    Record<string, { title: string; description: string; startingBid: string; consignorName: string }>
  >({});
  const [tab, setTab] = useState<"monitor" | "customers" | "email" | "inventory">("inventory");
  const [filingLot, setFilingLot] = useState<{ id: string; title: string; lotNumber?: string | null } | null>(
    null,
  );

  useEffect(() => {
    const next: typeof drafts = {};
    for (const item of data.queue) {
      next[item.id] = {
        title: item.title,
        description: item.description ?? "",
        startingBid: String(item.startingBid ?? 0),
        consignorName: item.consignor ?? "",
      };
    }
    setDrafts(next);
    const events: typeof eventEdits = {};
    for (const event of data.events) {
      events[event.id] = {
        name: event.name,
        auctionNumber: event.auctionNumber ?? "",
        startsAt: toLocalInput(event.startsAt),
        endsAt: toLocalInput(event.endsAt),
      };
    }
    setEventEdits(events);
  }, [data]);

  async function fileLotIntoSale(eventId: string) {
    if (!filingLot) return;
    const lot = filingLot;
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "lot", id: lot.id, eventId }),
    });
    if (!json) return;
    setFilingLot(null);
    setNotice(`Filed ${lot.title} into the selected week.`);
  }

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.inventory;
    if (!q) return list;
    return list.filter(
      (lot) =>
        lot.title.toLowerCase().includes(q) ||
        lot.consignor.toLowerCase().includes(q) ||
        lot.category.toLowerCase().includes(q) ||
        (lot.lotNumber ?? "").toLowerCase().includes(q) ||
        (lot.auctionNumber ?? "").toLowerCase().includes(q) ||
        lot.description.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl">Operations command center</h1>
          <p className="font-comic text-sm">Source: {data.source}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminSubnav />
          <button type="button" className="comic-btn-invert" onClick={() => void logout()}>
            Log out
          </button>
        </div>
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
            ["inventory", "Auction inventories"],
            ["monitor", "Live monitor"],
            ["customers", "Customers"],
            ["email", "Email engine"],
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
          <section className="space-y-4">
            <h2 className="font-display text-3xl">Consignor review queue</h2>
            <p className="font-comic text-sm">
              Pending and held items only. Approved lots leave this queue and file into the
              auction inventories below.
            </p>
            {data.queue.length === 0 ? (
              <p className="border-4 border-black bg-white p-4 font-comic">
                Queue is clear. New consignor submissions will show up here until you approve
                them.
              </p>
            ) : (
              <div className="space-y-4">
                {data.queue.map((item) => (
                  <ReviewCard
                    key={item.id}
                    item={item}
                    draft={
                      drafts[item.id] ?? {
                        title: item.title,
                        description: item.description ?? "",
                        startingBid: String(item.startingBid ?? 0),
                        consignorName: item.consignor ?? "",
                      }
                    }
                    consignors={data.consignors ?? []}
                    onDraft={(next) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: next,
                      }))
                    }
                    onApprove={(draft) =>
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
                          consignorName: draft.consignorName,
                        }),
                      }).then((json) => {
                        if (!json) return;
                        const lot = json.lot as
                          | { id: string; title: string; lotNumber?: string | null }
                          | undefined;
                        const lotNo = lot?.lotNumber ? `Lot ${lot.lotNumber}` : "warehouse lot";
                        setNotice(`Approved ${lotNo}. Pick the sale week.`);
                        if (lot?.id) setFilingLot(lot);
                      })
                    }
                    onHold={(draft) =>
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
                          consignorName: draft.consignorName,
                        }),
                      })
                    }
                    onReject={(draft) =>
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
                          consignorName: draft.consignorName,
                        }),
                      }).then(() => setNotice(`Rejected: ${draft.title}`))
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-3xl">Auction details</h2>
            <p className="font-comic text-sm">
              Fine-tune start/end times after you drop a week on the calendar.
            </p>
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
            <h2 className="font-display text-3xl">Inventories by auction</h2>
            <p className="font-comic text-sm">
              Main photo and short description for each lot, grouped by sale week.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, description, consignor, lot #, auction #"
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
            <AuctionInventories
              events={data.events}
              lots={filteredInventory}
              onChooseWeek={(lot) =>
                setFilingLot({ id: lot.id, title: lot.title, lotNumber: lot.lotNumber })
              }
              onToggleLive={(lot) =>
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
              onRemove={(lot) =>
                void mutate("/api/admin", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ entity: "lot", id: lot.id, remove: true }),
                }).then(() => setNotice(`Removed ${lot.title}`))
              }
            />
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

      <AuctionCalendarModal
        open={Boolean(filingLot)}
        lotLabel={
          filingLot ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ") : "this lot"
        }
        events={data.events}
        onClose={() => setFilingLot(null)}
        onSelect={(eventId) => void fileLotIntoSale(eventId)}
        onScheduleDay={(day) => {
          const times = weeklySaleTimes(day);
          void mutate("/api/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "createEvent",
              name: weeklySaleName(day),
              auctionNumber: data.suggestedAuctionNumber,
              startsAt: times.startsAt,
              endsAt: times.endsAt,
            }),
          }).then((json) => {
            const createdId = json?.event?.id as string | undefined;
            if (createdId) void fileLotIntoSale(createdId);
          });
        }}
      />
    </div>
  );
}

type Draft = {
  title: string;
  description: string;
  startingBid: string;
  consignorName: string;
};

function ReviewCard({
  item,
  draft,
  consignors,
  onDraft,
  onApprove,
  onHold,
  onReject,
}: {
  item: Consignment;
  draft: Draft;
  consignors: string[];
  onDraft: (draft: Draft) => void;
  onApprove: (draft: Draft) => void;
  onHold: (draft: Draft) => void;
  onReject: (draft: Draft) => void;
}) {
  const photo = item.imageUrls[0];
  return (
    <article className="flex flex-col gap-3 border-4 border-black bg-[#FFF7D1] p-4 shadow-[6px_6px_0_0_#000] sm:flex-row">
      {photo ? (
        <div className="relative h-36 w-full shrink-0 overflow-hidden border-4 border-black bg-white sm:h-40 sm:w-40">
          <LotImage src={photo} alt={item.title} fill className="object-cover" sizes="160px" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-3">
        <p className="font-display text-sm tracking-widest text-brand-red">
          {item.status.toUpperCase()}
        </p>
        <OwnerPicker
          value={draft.consignorName ?? ""}
          consignors={consignors}
          onChange={(name) => onDraft({ ...draft, consignorName: name })}
        />
        <label className="block font-comic text-sm font-bold">
          Title
          <input
            value={draft.title}
            onChange={(e) => onDraft({ ...draft, title: e.target.value })}
            className="mt-1 w-full border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="block font-comic text-sm font-bold">
          Description
          <textarea
            value={draft.description}
            onChange={(e) => onDraft({ ...draft, description: e.target.value })}
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
            onChange={(e) => onDraft({ ...draft, startingBid: e.target.value })}
            className="mt-1 w-40 border-4 border-black bg-white px-3 py-2 font-normal"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="comic-btn !text-base" onClick={() => onApprove(draft)}>
            Approve into inventory
          </button>
          <button type="button" className="comic-btn-invert !text-base" onClick={() => onHold(draft)}>
            Hold
          </button>
          <button type="button" className="comic-btn !text-base" onClick={() => onReject(draft)}>
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
