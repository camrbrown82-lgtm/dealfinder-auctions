"use client";

import { useMemo, useState } from "react";
import {
  AUCTION_PLAN_MONTHS,
  canPlanDate,
  dayKey,
  eventsOnDay,
  monthCells,
  monthLabel,
  shiftMonth,
} from "@/lib/auctionCalendar";
import type { AuctionEvent } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarGrid({
  events,
  selectedId,
  onSelect,
  onScheduleDay,
}: {
  events: AuctionEvent[];
  selectedId: string;
  onSelect: (eventId: string) => void;
  onScheduleDay: (day: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const cells = monthCells(year, month);
  const todayKey = dayKey(today);
  const min = new Date(today.getFullYear(), today.getMonth(), 1);
  const max = new Date(today.getFullYear(), today.getMonth() + AUCTION_PLAN_MONTHS, 1);

  function go(delta: number) {
    const next = shiftMonth(year, month, delta);
    const cursor = new Date(next.year, next.month, 1);
    if (cursor < min || cursor > max) return;
    setYear(next.year);
    setMonth(next.month);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl">{monthLabel(year, month)}</h3>
        <div className="flex gap-1">
          <button type="button" className="comic-btn-invert !px-2 !py-1 !text-sm" onClick={() => go(-1)}>
            Prev
          </button>
          <button type="button" className="comic-btn-invert !px-2 !py-1 !text-sm" onClick={() => go(1)}>
            Next
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center font-comic text-[10px] font-bold uppercase">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-0.5">
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="min-h-9" />;
          }
          const onDay = eventsOnDay(events, day);
          const planned = canPlanDate(day, today);
          const isToday = dayKey(day) === todayKey;
          const isSelected = onDay.some((event) => event.id === selectedId);
          const sale = onDay[0];
          return (
            <button
              key={dayKey(day)}
              type="button"
              disabled={!planned && !sale}
              onClick={() => {
                if (sale) onSelect(sale.id);
                else if (planned) onScheduleDay(day);
              }}
              className={`min-h-9 border border-black p-0.5 text-left leading-tight disabled:cursor-not-allowed disabled:opacity-40 ${
                isSelected
                  ? "bg-brand-red text-white"
                  : sale
                    ? "bg-[#FF0000]/15"
                    : planned
                      ? "bg-white hover:bg-[#FFF7D1]"
                      : "bg-[#EEE]"
              } ${isToday ? "outline outline-2 outline-offset-0 outline-black" : ""}`}
            >
              <span className="font-display text-xs">{day.getDate()}</span>
              {sale && (
                <span className="block truncate text-[9px] font-bold">{sale.auctionNumber || "Sale"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AuctionCalendarModal({
  open,
  lotLabel,
  events,
  onClose,
  onSelect,
  onScheduleDay,
}: {
  open: boolean;
  lotLabel: string;
  events: AuctionEvent[];
  onClose: () => void;
  onSelect: (eventId: string) => void;
  onScheduleDay: (day: Date) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-calendar-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border-4 border-black bg-white p-4 shadow-[8px_8px_0_0_#000]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="sale-calendar-title" className="font-display text-2xl">
          Pick the sale week
        </h2>
        <p className="mt-1 font-comic text-sm">
          File <strong>{lotLabel}</strong> onto a weekly auction (up to {AUCTION_PLAN_MONTHS} months
          ahead). Tap a sale, or tap an empty day to add that week.
        </p>
        <div className="mt-3">
          <CalendarGrid
            events={events}
            selectedId=""
            onSelect={onSelect}
            onScheduleDay={onScheduleDay}
          />
        </div>
        <button type="button" className="comic-btn-invert mt-3 w-full !text-base" onClick={onClose}>
          File later
        </button>
      </div>
    </div>
  );
}
