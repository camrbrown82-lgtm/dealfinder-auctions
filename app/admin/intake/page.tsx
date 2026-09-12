"use client";

import { useState } from "react";
import { AdminAiIntake } from "@/components/AdminAiIntake";
import { AdminDesk, type AdminDeskApi } from "@/components/admin/AdminDesk";
import { AdminSubnav } from "@/components/admin/AdminSubnav";
import { AuctionCalendarModal } from "@/components/admin/AuctionCalendar";
import { weeklySaleName, weeklySaleTimes } from "@/lib/auctionCalendar";

export default function AdminIntakePage() {
  return (
    <AdminDesk>
      {(desk) => <IntakeWorkspace desk={desk} />}
    </AdminDesk>
  );
}

function IntakeWorkspace({ desk }: { desk: AdminDeskApi }) {
  const { data, error, notice, setNotice, load, mutate, logout } = desk;
  const [filingLot, setFilingLot] = useState<{ id: string; title: string; lotNumber?: string | null } | null>(
    null,
  );

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl">AI generator</h1>
          <p className="font-comic text-sm">
            Work one photo at a time. When you save or post live, this workspace clears and
            you pick the auction inventory.
          </p>
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

      <AdminAiIntake
        workspace
        suggestedLotNumber={data.suggestedLotNumber ?? "LOT-0001"}
        consignors={data.consignors ?? []}
        onPosted={async (message, lot) => {
          await load();
          setNotice(message);
          if (lot?.id) setFilingLot(lot);
        }}
      />

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
