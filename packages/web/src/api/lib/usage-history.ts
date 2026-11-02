/**
 * Derives a client's usage history from invoices — no extra table needed.
 *
 * Each invoice already carries its reporting window (`billing_period_start` is
 * the 1st or the 16th). Windows with no invoice are still listed, flagged
 * `hasReading: false`, so the client sees "No reading yet" instead of a gap.
 */
import { calcAmountDue } from "./billing";
import { listWindows, shiftWindow, windowContaining, windowStartForDate } from "./usage-period";

/** Structural subset of an invoice row — keeps this module free of DB types. */
export interface UsageInvoiceLike {
  clientId: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  consumptionUnits: number;
  amountDueKes: number | null;
  invoiceNumber: string;
  status: string;
  issuedAt: Date | null;
  createdAt: Date | null;
}

export interface UsageHistoryPeriod {
  /** Window key (YYYY-MM-01 or YYYY-MM-16) and its bounds. */
  windowStart: string;
  windowEnd: string;
  /** What the invoice itself says — the full month for legacy invoices. */
  periodStart: string;
  periodEnd: string;
  units: number | null;
  amountKes: number | null;
  invoiceNumber: string | null;
  status: string | null;
  lastUpdatedAt: Date | null;
  hasReading: boolean;
  isLatest: boolean;
  /** Units minus the previous *reading* (skips empty windows). */
  changeUnits: number | null;
  previousUnits: number | null;
}

export interface UsageHistory {
  clientId: number;
  periods: UsageHistoryPeriod[];
  latest: UsageHistoryPeriod | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * @param clientId session client — rows belonging to anyone else are ignored,
 *   so a bug in a caller can never leak another account's history.
 */
export function buildUsageHistory(
  clientId: number,
  rows: UsageInvoiceLike[],
  options: { today?: string; maxPeriods?: number } = {},
): UsageHistory {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const maxPeriods = Math.max(1, options.maxPeriods ?? 12);

  // Isolation guard: filter again even though the query is already scoped.
  const own = rows.filter((row) => row.clientId === clientId);

  // One invoice per window; the newest row wins if history ever holds a duplicate.
  const byWindow = new Map<string, UsageInvoiceLike>();
  for (const row of [...own].sort((a, b) => a.billingPeriodStart.localeCompare(b.billingPeriodStart))) {
    byWindow.set(windowStartForDate(row.billingPeriodStart), row);
  }

  const readingStarts = [...byWindow.keys()].sort();
  const currentStart = windowContaining(today).start;
  const newestStart = readingStarts.at(-1) && readingStarts.at(-1)! > currentStart
    ? readingStarts.at(-1)!
    : currentStart;

  // Never render more than `maxPeriods`, and never pad before the first reading.
  const earliestAllowed = shiftWindow(newestStart, -(maxPeriods - 1)).start;
  const oldestStart = readingStarts.length
    ? [earliestAllowed, readingStarts[0]].sort().at(-1)!
    : currentStart;

  const windows = listWindows(oldestStart, newestStart);
  const latestStart = readingStarts.length ? readingStarts.at(-1)! : null;

  /**
   * Legacy invoices (issued before the 15-day cycle) cover a whole month but
   * are keyed to the first window. Treat the second window of that month as
   * covered instead of showing a phantom "No reading yet" right after it.
   */
  const covers = (windowStart: string, windowEnd: string) =>
    own.some((row) => row.billingPeriodStart <= windowStart && row.billingPeriodEnd >= windowEnd);

  let previousUnits: number | null = null;
  const ascending = windows.flatMap((window): UsageHistoryPeriod[] => {
    const invoice = byWindow.get(window.start) ?? null;
    if (!invoice && covers(window.start, window.end)) return [];
    const isReading = invoice !== null;
    const units = invoice ? Number(invoice.consumptionUnits) : null;
    const changeUnits = isReading && previousUnits !== null ? round2(units! - previousUnits) : null;

    const period: UsageHistoryPeriod = {
      windowStart: window.start,
      windowEnd: window.end,
      periodStart: invoice?.billingPeriodStart ?? window.start,
      periodEnd: invoice?.billingPeriodEnd ?? window.end,
      units,
      amountKes: invoice ? Number(invoice.amountDueKes ?? calcAmountDue(units!)) : null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      status: invoice?.status ?? null,
      lastUpdatedAt: invoice?.issuedAt ?? invoice?.createdAt ?? null,
      hasReading: isReading,
      isLatest: window.start === latestStart,
      changeUnits,
      previousUnits: isReading ? previousUnits : null,
    };

    if (isReading) previousUnits = units;
    return [period];
  });

  const periods = ascending.reverse();
  return {
    clientId,
    periods,
    latest: periods.find((period) => period.isLatest) ?? null,
  };
}
