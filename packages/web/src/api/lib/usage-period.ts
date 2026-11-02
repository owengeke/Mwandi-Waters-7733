/**
 * 15-day reporting windows.
 *
 * Mwandi Waters reads meters twice a month: the 1st–15th and the 16th–end of
 * month. Invoices already store an explicit period (`billing_period_start` /
 * `billing_period_end`), so no schema change is needed — an invoice is a
 * window, and its start date (the 1st or the 16th) is the window key.
 *
 * Everything works on `YYYY-MM-DD` strings interpreted in UTC, so a server in
 * any timezone groups the same invoice into the same window.
 */

export const USAGE_HALVES = ["FIRST", "SECOND"] as const;
export type UsageHalf = (typeof USAGE_HALVES)[number];

export interface UsageWindow {
  /** YYYY-MM-DD — always the 1st or the 16th. */
  start: string;
  /** YYYY-MM-DD — the 15th, or the last day of the month. */
  end: string;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Days in a 1-based month, e.g. daysInMonth(2026, 2) === 28. */
export const daysInMonth = (year: number, month1: number) =>
  new Date(Date.UTC(year, month1, 0)).getUTCDate();

/** Window for a `YYYY-MM` month plus a half. */
export function windowFor(month: string, half: UsageHalf): UsageWindow {
  const [year, month1] = month.split("-").map(Number);
  if (half === "FIRST") return { start: `${month}-01`, end: `${month}-15` };
  return { start: `${month}-16`, end: `${month}-${pad2(daysInMonth(year, month1))}` };
}

/** Window key for any date: the 1st for days 1–15, the 16th after that. */
export function windowStartForDate(dateISO: string): string {
  const day = Number(dateISO.slice(8, 10));
  return `${dateISO.slice(0, 7)}-${day <= 15 ? "01" : "16"}`;
}

/** The window a date falls inside. */
export function windowContaining(dateISO: string): UsageWindow {
  return windowFor(dateISO.slice(0, 7), Number(dateISO.slice(8, 10)) <= 15 ? "FIRST" : "SECOND");
}

/** Move one window forward (+1) or backward (-1). */
export function stepWindow(start: string, direction: 1 | -1): UsageWindow {
  const [year, month1] = start.split("-").map(Number);
  const isFirstHalf = start.endsWith("-01");

  if (direction === 1) {
    if (isFirstHalf) return windowFor(`${year}-${pad2(month1)}`, "SECOND");
    const nextYear = month1 === 12 ? year + 1 : year;
    const nextMonth = month1 === 12 ? 1 : month1 + 1;
    return windowFor(`${nextYear}-${pad2(nextMonth)}`, "FIRST");
  }

  if (isFirstHalf) {
    const prevYear = month1 === 1 ? year - 1 : year;
    const prevMonth = month1 === 1 ? 12 : month1 - 1;
    return windowFor(`${prevYear}-${pad2(prevMonth)}`, "SECOND");
  }
  return windowFor(`${year}-${pad2(month1)}`, "FIRST");
}

/** Shift a window start by `steps` windows (negative moves backwards). */
export function shiftWindow(start: string, steps: number): UsageWindow {
  let current: UsageWindow = windowContaining(start);
  const direction = steps >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i += 1) current = stepWindow(current.start, direction);
  return current;
}

/** Inclusive list of windows in ascending order; empty when from > to. */
export function listWindows(fromStart: string, toStart: string): UsageWindow[] {
  const out: UsageWindow[] = [];
  let current = windowContaining(fromStart);
  const last = windowStartForDate(toStart);
  while (current.start <= last) {
    out.push(current);
    current = stepWindow(current.start, 1);
  }
  return out;
}

const dayOnly = new Intl.DateTimeFormat("en-KE", { day: "numeric", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("en-KE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * "1–15 Nov 2026" / "16–30 Nov 2026". Same-year, same-month windows collapse
 * the month and year onto the second half only.
 */
export function windowLabel(window: UsageWindow): string {
  const start = asDate(window.start);
  const end = asDate(window.end);
  const sameMonth = window.start.slice(0, 7) === window.end.slice(0, 7);
  if (sameMonth) return `${dayOnly.format(start)}–${dayMonthYear.format(end)}`;
  return `${dayMonthYear.format(start)} – ${dayMonthYear.format(end)}`;
}

