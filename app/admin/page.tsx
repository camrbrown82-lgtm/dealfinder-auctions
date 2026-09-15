"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminDesk } from "@/components/admin/AdminDesk";
import { AdminShell } from "@/components/admin/AdminShell";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { AuctionInventories } from "@/components/admin/AuctionInventories";
import { CustomerDesk } from "@/components/admin/CustomerDesk";
import { EmailEngine } from "@/components/admin/EmailEngine";
import { HouseCatalogSettings } from "@/components/admin/HouseCatalogSettings";
import { LiveMonitor } from "@/components/admin/LiveMonitor";
import { DEFAULT_HOUSE_STARTING_BID } from "@/lib/houseDesk";
import { lotNeedsRelist } from "@/lib/settlements";
import { listingGradeOf } from "@/lib/listingGrade";
import type { AuctionLot } from "@/lib/utils";

export default function AdminPage() {
  const desk = useAdminDesk();
  const { data, setNotice, mutate } = desk;
  const [search, setSearch] = useState("");
  const [eventEdits, setEventEdits] = useState<
    Record<string, { name: string; auctionNumber: string; startsAt: string; endsAt: string }>
  >({});
  const [tab, setTab] = useState<"monitor" | "customers" | "email" | "inventory">("inventory");
  const [filingLot, setFilingLot] = useState<AuctionLot | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
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
    const relist = lotNeedsRelist(lot) && Boolean(lot.eventId || lot.status === "ended");
    const json = await mutate("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "lot",
        id: lot.id,
        eventId,
        status: "live",
        relist,
        startingBid: lot.startingBid,
      }),
    });
    if (!json) return;
    setFilingLot(null);
    setNotice(`Moved ${lot.title} into the selected auction.`);
  }

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.inventory;
    if (!q) return list;
    return list.filter(
      (lot) =>
        lot.title.toLowerCase().includes(q) ||
        lot.consignor.toLowerCase().includes(q) ||
        listingGradeOf(lot).toLowerCase().includes(q) ||
        (lot.lotNumber ?? "").toLowerCase().includes(q) ||
        (lot.auctionNumber ?? "").toLowerCase().includes(q) ||
        lot.description.toLowerCase().includes(q),
    );
  }, [data, search]);

  const upcomingEvents = data.events.filter((event) => !event.archivedAt);
  const reviewCount = data.queue.length;
  const visibleLots = filteredInventory;
  const visibleEvents = showArchived
    ? data.events
    : data.events.filter(
        (event) =>
          !event.archivedAt || filteredInventory.some((lot) => lot.eventId === event.id),
      );

  return (
    <AdminShell title="House" subtitle="Inventories, live floor, customers, and email.">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href="/admin/review" className="comic-btn">
          Review consignments{reviewCount ? ` (${reviewCount})` : ""}
        </Link>
        <Link href="/admin/settlements" className="comic-btn-invert">
          Settlements
        </Link>
        <a className="comic-btn-invert" href="/api/admin/export">
          Export Excel / Sheets
        </a>
      </div>

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
            className={`${tab === id ? "comic-btn" : "comic-btn-invert"} w-[calc(50%-0.25rem)] sm:w-auto`}
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
            <h2 className="font-display text-3xl">Auction details</h2>
            <p className="font-comic text-sm">
              Weekly sales are Sep 20, Sep 27, and Oct 4. Start/end times follow those weeks.
            </p>
            <ul className="space-y-2">
              {visibleEvents.map((event) => {
                const edit = eventEdits[event.id] ?? {
                  name: event.name,
                  auctionNumber: event.auctionNumber ?? "",
                  startsAt: toLocalInput(event.startsAt),
                  endsAt: toLocalInput(event.endsAt),
                };
                return (
                  <li key={event.id} className="comic-panel-sm space-y-2 p-3 font-comic">
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
                    {event.archivedAt ? (
                      <button
                        type="button"
                        className="comic-btn-invert !text-base"
                        onClick={() =>
                          void mutate("/api/admin", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ entity: "event", id: event.id, archivedAt: null }),
                          }).then(() => setNotice(`Restored ${edit.auctionNumber || edit.name} to inventory`))
                        }
                      >
                        Restore to inventory
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-3xl">Inventories by auction</h2>
            <p className="font-comic text-sm">
              Unsold ended lots can be moved into an upcoming auction. Saved settlement records archive
              that sale out of this list until you restore it. Lots are listed in lot-number order.
            </p>
            <HouseCatalogSettings
              settings={
                data.houseSettings ?? {
                  defaultStartingBid: DEFAULT_HOUSE_STARTING_BID,
                  nextLotNumber: data.suggestedLotNumber ?? "LOT-0001",
                }
              }
              onSave={(next) =>
                void mutate("/api/admin", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "saveHouseSettings",
                    defaultStartingBid: next.defaultStartingBid,
                    nextLotNumber: next.nextLotNumber,
                  }),
                }).then(() => setNotice("Saved house starting bid and next lot #."))
              }
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, description, consignor, lot #, auction #"
                className="min-w-0 w-full flex-1 border-4 border-black bg-white px-3 py-2 font-comic sm:min-w-[220px]"
              />
              <label className="comic-panel-sm inline-flex items-center gap-2 px-3 py-2 font-comic text-sm font-bold">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show archived sales
              </label>
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
              events={visibleEvents}
              lots={visibleLots}
              onMoveToSale={setFilingLot}
              onRemove={(lot) =>
                void mutate("/api/admin", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ entity: "lot", id: lot.id, remove: true }),
                }).then((json) => {
                  if (!json) return;
                  const where = json.destination === "settlements" ? "settlements" : "unsold";
                  setNotice(`Pulled ${lot.title} off live into ${where}.`);
                })
              }
            />
          </section>
        </div>
      )}

      <AuctionCalendarModal
        open={Boolean(filingLot)}
        lotLabel={
          filingLot ? [filingLot.lotNumber, filingLot.title].filter(Boolean).join(" · ") : "this lot"
        }
        events={upcomingEvents}
        onClose={() => setFilingLot(null)}
        onSelect={(eventId) => void fileLotIntoSale(eventId)}
      />
    </AdminShell>
  );
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
