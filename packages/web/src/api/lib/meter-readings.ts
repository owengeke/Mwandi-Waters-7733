/**
 * Meter-reading rules, shared by the API and the web UI.
 *
 * A reading is the number on the meter. Everything else — units used, the
 * money owed — is derived from the difference between two readings. All unit
 * arithmetic goes through integer hundredths so decimals never drift.
 *
 * This module is intentionally free of database imports so it can be unit
 * tested in isolation and reused by the client without pulling in the router.
 */

export interface MeterReadingLike {
  id: number;
  clientId: number;
  readingValue: number;
  previousReading: number;
  unitsConsumed: number;
  readingDate: string;
  isOpening: boolean;
  invoiceId: number | null;
  meterNumber?: string | null;
  createdAt?: Date | null;
}

/** How long a new reading bill is given before it is overdue. */
export const INVOICE_DUE_DAYS = 14;

export const READING_MAX = 10_000_000;

// ---------- Decimal-safe unit maths ----------
export const toHundredths = (value: number) => Math.round(value * 100);
export const fromHundredths = (hundredths: number) => hundredths / 100;
export const roundReading = (value: number) => fromHundredths(toHundredths(value));

/** current − previous, rounded to 2 dp without float drift. */
export function unitsBetween(previous: number, current: number): number {
  return fromHundredths(toHundredths(current) - toHundredths(previous));
}

// ---------- Opening readings ----------
export interface OpeningReadingInput {
  clientId: number;
  /** The number shown on the newly fitted meter. */
  reading: number;
  readingDate: string;
  recordedBy?: string | null;
  meterNumber?: string | null;
}

/**
 * The one row that starts a meter chain. It always has `units_consumed = 0`
 * and no invoice, so installing a meter never creates a charge.
 */
export function openingReadingRow(input: OpeningReadingInput) {
  const value = roundReading(input.reading);
  return {
    clientId: input.clientId,
    readingValue: value,
    previousReading: value,
    unitsConsumed: 0,
    readingDate: input.readingDate,
    recordedBy: input.recordedBy ?? null,
    invoiceId: null,
    isOpening: true,
    meterNumber: input.meterNumber ?? null,
  };
}

// ---------- Ordering and lookups ----------
const compareAscending = (a: MeterReadingLike, b: MeterReadingLike) => {
  if (a.readingDate !== b.readingDate) return a.readingDate < b.readingDate ? -1 : 1;
  return a.id - b.id;
};

export function sortReadingsAscending<T extends MeterReadingLike>(readings: readonly T[]): T[] {
  return [...readings].sort(compareAscending);
}

/** The newest reading, opening or not — this is what the next reading compares against. */
export function latestReading<T extends MeterReadingLike>(readings: readonly T[]): T | null {
  return sortReadingsAscending(readings).at(-1) ?? null;
}

/** The newest billed (non-opening) reading. */
export function latestBilledReading<T extends MeterReadingLike>(readings: readonly T[]): T | null {
  return sortReadingsAscending(readings.filter((r) => !r.isOpening)).at(-1) ?? null;
}

/** The newest opening reading — the start of the current meter chain. */
export function latestOpening<T extends MeterReadingLike>(readings: readonly T[]): T | null {
  return sortReadingsAscending(readings.filter((r) => r.isOpening)).at(-1) ?? null;
}

/** Mean units of the billed readings, rounded to 2 dp. `null` with no history. */
export function averageUnits(readings: readonly MeterReadingLike[]): number | null {
  const billed = readings.filter((r) => !r.isOpening);
  if (billed.length === 0) return null;
  const total = billed.reduce((sum, r) => sum + toHundredths(r.unitsConsumed), 0);
  return fromHundredths(Math.round(total / billed.length));
}

/** True when this exact reading was already recorded on this day. */
export function isDuplicateReading(
  readings: readonly MeterReadingLike[],
  currentReading: number,
  readingDate: string,
): boolean {
  const value = toHundredths(currentReading);
  return readings.some(
    (r) => !r.isOpening && r.readingDate === readingDate && toHundredths(r.readingValue) === value,
  );
}

/** The only reading that may be corrected: the newest one, provided it was billed. */
export function latestCorrectableReading<T extends MeterReadingLike>(readings: readonly T[]): T | null {
  const latest = latestReading(readings);
  if (!latest || latest.isOpening || latest.invoiceId === null) return null;
  return latest;
}

// ---------- Validation ----------
export interface ReadingCheckInput {
  currentReading: number;
  readingDate: string;
  previous: MeterReadingLike | null;
  /** Mean units of earlier readings, used for the >3× sanity check. */
  averageUnits?: number | null;
}

export interface ReadingCheck {
  ok: boolean;
  /** Units used; 0 when the check failed. */
  units: number;
  error: string | null;
  warning: string | null;
  /** High usage needs an explicit admin confirmation before the bill is issued. */
  requiresConfirmation: boolean;
}

const fail = (error: string): ReadingCheck => ({
  ok: false,
  units: 0,
  error,
  warning: null,
  requiresConfirmation: false,
});

/**
 * Server-side guard for a new reading. The client may show warnings early, but
 * this is the source of truth and is always applied inside the transaction.
 */
export function checkReading(input: ReadingCheckInput): ReadingCheck {
  const current = roundReading(input.currentReading);
  if (!Number.isFinite(current) || current < 0) return fail("Enter a valid meter reading.");

  const previous = input.previous;
  if (!previous) return fail("Set an opening meter reading before recording usage.");

  const previousValue = roundReading(previous.readingValue);

  if (current < previousValue) {
    return fail(
      `Reading must be at least ${formatReading(previousValue)}. ` +
        `The last reading was ${formatReading(previousValue)} on ${formatReadingDate(previous.readingDate)}.`,
    );
  }

  if (input.readingDate < previous.readingDate) {
    return fail(
      `Reading date cannot be earlier than the last reading on ${formatReadingDate(previous.readingDate)}.`,
    );
  }

  const units = unitsBetween(previousValue, current);
  let warning: string | null = null;
  let requiresConfirmation = false;

  if (units === 0) {
    warning = "0 units used — double-check the meter.";
  }

  const average = input.averageUnits ?? null;
  if (average !== null && average > 0 && units > average * 3) {
    warning = `${(units / average).toFixed(1)}× the client's average of ${formatReading(average)} units.`;
    requiresConfirmation = true;
  }

  return { ok: true, units, error: null, warning, requiresConfirmation };
}

// ---------- History for the client dashboard ----------
export interface MeterHistorySource extends MeterReadingLike {
  recordedBy?: string | null;
  correctedAt?: Date | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  amountKes: number | null;
}

export interface MeterHistoryReading {
  id: number;
  readingValue: number;
  previousReading: number;
  unitsConsumed: number;
  readingDate: string;
  isOpening: boolean;
  meterNumber: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  amountKes: number | null;
  /** Units used versus the previous billed reading; `null` for the first. */
  changeUnits: number | null;
}

export interface MeterChartPoint {
  readingDate: string;
  readingValue: number;
  units: number;
  isLatest: boolean;
}

export interface MeterHistory {
  clientId: number;
  /** Newest first, opening row included. */
  readings: MeterHistoryReading[];
  latest: MeterHistoryReading | null;
  opening: MeterHistoryReading | null;
  averageUnits: number | null;
  totalUnits: number;
  billedCount: number;
  /** Last readings with usage, oldest first, for the bar chart. */
  chart: MeterChartPoint[];
}

export function buildMeterHistory(
  clientId: number,
  rows: readonly MeterHistorySource[],
  options: { chartSize?: number } = {},
): MeterHistory {
  const chartSize = Math.max(1, options.chartSize ?? 12);

  // Isolation guard: a caller bug can never leak another account's readings.
  const own = rows.filter((r) => r.clientId === clientId);
  const ascending = sortReadingsAscending(own);

  let previousUnits: number | null = null;
  const entries: MeterHistoryReading[] = ascending.map((r) => {
    const changeUnits =
      r.isOpening || previousUnits === null
        ? null
        : fromHundredths(toHundredths(r.unitsConsumed) - toHundredths(previousUnits));
    if (!r.isOpening) previousUnits = r.unitsConsumed;
    return {
      id: r.id,
      readingValue: roundReading(r.readingValue),
      previousReading: roundReading(r.previousReading),
      unitsConsumed: roundReading(r.unitsConsumed),
      readingDate: r.readingDate,
      isOpening: r.isOpening,
      meterNumber: r.meterNumber ?? null,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      invoiceStatus: r.invoiceStatus,
      amountKes: r.amountKes,
      changeUnits,
    };
  });

  const newestFirst = [...entries].reverse();
  const latest = newestFirst.find((r) => !r.isOpening) ?? null;
  const opening = newestFirst.find((r) => r.isOpening) ?? null;
  const billed = entries.filter((r) => !r.isOpening);

  const chart: MeterChartPoint[] = billed.slice(-chartSize).map((r) => ({
    readingDate: r.readingDate,
    readingValue: r.readingValue,
    units: r.unitsConsumed,
    isLatest: latest?.id === r.id,
  }));

  return {
    clientId,
    readings: newestFirst,
    latest,
    opening,
    averageUnits: averageUnits(own),
    totalUnits: fromHundredths(billed.reduce((sum, r) => sum + toHundredths(r.unitsConsumed), 0)),
    billedCount: billed.length,
    chart,
  };
}

// ---------- Formatting (server notices) ----------
const readingFormat = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 3 });
export const formatReading = (value: number) => readingFormat.format(value);

const dateFormat = new Intl.DateTimeFormat("en-KE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "29 Oct 2026" for a YYYY-MM-DD string. */
export const formatReadingDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

/** Add whole days to a YYYY-MM-DD string. */
export function addDaysISO(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
