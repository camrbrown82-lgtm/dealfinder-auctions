import type { AuctionEvent } from "@/lib/utils";

export const AUCTION_PLAN_MONTHS = 3;

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const pad = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function eventsOnDay(events: AuctionEvent[], day: Date) {
  const key = dayKey(day);
  return events.filter((event) => dayKey(new Date(event.startsAt)) === key);
}

export function canPlanDate(day: Date, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth() + AUCTION_PLAN_MONTHS, now.getDate());
  const value = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return value >= start && value <= end;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

export function weeklySaleTimes(day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 7, 18, 0, 0);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function weeklySaleName(day: Date) {
  const label = day.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `Weekly sale · ${label}`;
}
