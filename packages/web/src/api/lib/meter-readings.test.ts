import { describe, expect, test } from "bun:test";
import {
  addDaysISO,
  averageUnits,
  buildMeterHistory,
  checkReading,
  isDuplicateReading,
  latestCorrectableReading,
  latestReading,
  unitsBetween,
  type MeterHistorySource,
  type MeterReadingLike,
} from "./meter-readings";

let seq = 0;
function reading(partial: Partial<MeterReadingLike> & { readingValue: number; readingDate: string }): MeterReadingLike {
  seq += 1;
  return {
    id: partial.id ?? seq,
    clientId: partial.clientId ?? 1,
    readingValue: partial.readingValue,
    previousReading: partial.previousReading ?? 0,
    unitsConsumed: partial.unitsConsumed ?? partial.readingValue,
    readingDate: partial.readingDate,
    isOpening: partial.isOpening ?? false,
    invoiceId: partial.invoiceId ?? null,
    meterNumber: partial.meterNumber ?? "MTR-0001",
  };
}

const opening = (value: number, date: string, extra: Partial<MeterReadingLike> = {}) =>
  reading({ readingValue: value, previousReading: value, unitsConsumed: 0, isOpening: true, readingDate: date, ...extra });

describe("unitsBetween", () => {
  test("plain integers", () => {
    expect(unitsBetween(15, 32)).toBe(17);
  });

  test("decimals never drift", () => {
    expect(unitsBetween(22.75, 31.95)).toBe(9.2);
    expect(unitsBetween(9.2, 32)).toBe(22.8);
    expect(unitsBetween(18.4, 22.75)).toBe(4.35);
    expect(unitsBetween(0.1, 0.3)).toBe(0.2);
  });

  test("zero when the meter has not moved", () => {
    expect(unitsBetween(32, 32)).toBe(0);
  });
});

describe("latestReading", () => {
  test("picks the newest reading automatically after a save", () => {
    const first = reading({ id: 1, readingValue: 15, readingDate: "2026-10-01" });
    const saved = reading({ id: 2, readingValue: 32, readingDate: "2026-10-29" });
    expect(latestReading([first])?.readingValue).toBe(15);
    expect(latestReading([saved, first])?.readingValue).toBe(32);
    // Newest by date regardless of array order.
    expect(latestReading([saved, first])?.id).toBe(2);
  });

  test("ties on date break by insertion order", () => {
    const old = reading({ id: 5, readingValue: 30, readingDate: "2026-11-02" });
    const replacement = opening(2, "2026-11-02", { id: 9, meterNumber: "MTR-7777" });
    expect(latestReading([old, replacement])?.id).toBe(9);
  });
});

describe("first reading from an opening", () => {
  test("opening 0", () => {
    const check = checkReading({ currentReading: 17, readingDate: "2026-11-02", previous: opening(0, "2026-10-01") });
    expect(check.ok).toBe(true);
    expect(check.units).toBe(17);
  });

  test("opening 2 read at 19 is 17 units", () => {
    const check = checkReading({ currentReading: 19, readingDate: "2026-11-02", previous: opening(2, "2026-10-01") });
    expect(check.ok).toBe(true);
    expect(check.units).toBe(17);
  });
});

describe("checkReading validation", () => {
  test("rejects a lower reading and names the previous reading", () => {
    const previous = reading({ readingValue: 32, readingDate: "2026-10-29" });
    const check = checkReading({ currentReading: 20, readingDate: "2026-11-02", previous });
    expect(check.ok).toBe(false);
    expect(check.error).toBe("Reading must be at least 32. The last reading was 32 on 29 Oct 2026.");
  });

  test("rejects a reading date earlier than the last one", () => {
    const previous = reading({ readingValue: 32, readingDate: "2026-10-29" });
    const check = checkReading({ currentReading: 40, readingDate: "2026-10-01", previous });
    expect(check.ok).toBe(false);
    expect(check.error).toContain("cannot be earlier");
  });

  test("requires an opening reading first", () => {
    const check = checkReading({ currentReading: 5, readingDate: "2026-11-02", previous: null });
    expect(check.ok).toBe(false);
    expect(check.error).toContain("opening");
  });

  test("zero units is allowed with a warning", () => {
    const previous = reading({ readingValue: 32, readingDate: "2026-10-29" });
    const check = checkReading({ currentReading: 32, readingDate: "2026-11-02", previous });
    expect(check.ok).toBe(true);
    expect(check.units).toBe(0);
    expect(check.warning).toContain("0 units");
    expect(check.requiresConfirmation).toBe(false);
  });

  test("more than 3x the average needs confirmation", () => {
    const previous = reading({ readingValue: 40, readingDate: "2026-10-29" });
    const check = checkReading({
      currentReading: 80,
      readingDate: "2026-11-02",
      previous,
      averageUnits: 10,
    });
    expect(check.ok).toBe(true);
    expect(check.units).toBe(40);
    expect(check.requiresConfirmation).toBe(true);
    expect(check.warning).toContain("4.0×");
  });
});

describe("duplicate submit guard", () => {
  test("same reading on the same day is a duplicate, other days are not", () => {
    const rows = [reading({ readingValue: 32, readingDate: "2026-11-02" })];
    expect(isDuplicateReading(rows, 32, "2026-11-02")).toBe(true);
    expect(isDuplicateReading(rows, 32.0, "2026-11-02")).toBe(true);
    expect(isDuplicateReading(rows, 32, "2026-11-03")).toBe(false);
    expect(isDuplicateReading(rows, 33, "2026-11-02")).toBe(false);
  });
});

describe("meter replacement", () => {
  test("new chain starts at the new opening and units never go negative", () => {
    const chain = [
      opening(0, "2026-04-01", { id: 1 }),
      reading({ id: 2, readingValue: 17.2, readingDate: "2026-04-30", invoiceId: 1 }),
      reading({ id: 3, readingValue: 36.8, readingDate: "2026-05-31", invoiceId: 2 }),
      // Meter replaced; the new meter starts at 2.
      opening(2, "2026-06-01", { id: 4, meterNumber: "MTR-9999" }),
    ];
    const previous = latestReading(chain);
    expect(previous?.isOpening).toBe(true);
    expect(previous?.readingValue).toBe(2);

    const check = checkReading({ currentReading: 19, readingDate: "2026-07-01", previous });
    expect(check.ok).toBe(true);
    expect(check.units).toBe(17);

    // An old readout below the new opening is rejected rather than negative.
    const bad = checkReading({ currentReading: 1, readingDate: "2026-07-01", previous });
    expect(bad.ok).toBe(false);
  });
});

describe("correcting the latest reading", () => {
  test("only the newest billed reading can be corrected", () => {
    const older = reading({ id: 1, readingValue: 20, readingDate: "2026-10-01", invoiceId: 1 });
    const latest = reading({ id: 2, readingValue: 32, readingDate: "2026-11-02", invoiceId: 2 });
    expect(latestCorrectableReading([older, latest])?.id).toBe(2);
    expect(latestCorrectableReading([older])?.id).toBe(1);
    expect(latestCorrectableReading([])).toBeNull();
    // An opening is never correctable through this path.
    expect(latestCorrectableReading([older, opening(2, "2026-11-03", { id: 3 })])).toBeNull();
    // A reading without an invoice is not billable and cannot be corrected.
    expect(latestCorrectableReading([reading({ id: 4, readingValue: 5, readingDate: "2026-11-03" })])).toBeNull();
  });
});

describe("averageUnits", () => {
  test("averages billed readings only", () => {
    const rows = [
      opening(0, "2026-04-01"),
      reading({ readingValue: 10, unitsConsumed: 10, readingDate: "2026-04-30" }),
      reading({ readingValue: 30, unitsConsumed: 20, readingDate: "2026-05-31" }),
    ];
    expect(averageUnits(rows)).toBe(15);
    expect(averageUnits([opening(0, "2026-04-01")])).toBeNull();
  });
});

describe("buildMeterHistory", () => {
  const source = (partial: Partial<MeterHistorySource> & { id: number; clientId: number; readingValue: number; readingDate: string }): MeterHistorySource => ({
    previousReading: partial.previousReading ?? 0,
    unitsConsumed: partial.unitsConsumed ?? partial.readingValue,
    isOpening: partial.isOpening ?? false,
    invoiceId: partial.invoiceId ?? null,
    invoiceNumber: partial.invoiceNumber ?? null,
    invoiceStatus: partial.invoiceStatus ?? null,
    amountKes: partial.amountKes ?? null,
    ...partial,
  });

  test("returns only the requested client's readings, newest first", () => {
    const history = buildMeterHistory(1, [
      source({ id: 1, clientId: 1, readingValue: 0, readingDate: "2026-04-01", isOpening: true }),
      source({ id: 2, clientId: 1, readingValue: 17, readingDate: "2026-04-30", invoiceNumber: "INV-00001", invoiceStatus: "PAID", amountKes: 2550 }),
      source({ id: 3, clientId: 2, readingValue: 120, readingDate: "2026-05-01", invoiceNumber: "INV-99999", invoiceStatus: "PAID", amountKes: 18000 }),
    ]);

    expect(history.readings.map((r) => r.id)).toEqual([2, 1]);
    expect(history.billedCount).toBe(1);
    expect(history.totalUnits).toBe(17);
    expect(history.latest?.id).toBe(2);
    expect(history.opening?.id).toBe(1);
    expect(history.chart.map((p) => p.units)).toEqual([17]);
  });

  test("computes the change versus the previous billed reading", () => {
    const history = buildMeterHistory(1, [
      source({ id: 1, clientId: 1, readingValue: 0, readingDate: "2026-04-01", isOpening: true }),
      source({ id: 2, clientId: 1, readingValue: 10, unitsConsumed: 10, readingDate: "2026-04-30" }),
      source({ id: 3, clientId: 1, readingValue: 25, unitsConsumed: 15, readingDate: "2026-05-31" }),
    ]);

    const newest = history.readings[0];
    const older = history.readings[1];
    expect(newest.changeUnits).toBe(5);
    expect(older.changeUnits).toBeNull();
    expect(history.averageUnits).toBe(12.5);
    expect(history.chart.map((p) => p.units)).toEqual([10, 15]);
    expect(history.chart.at(-1)?.isLatest).toBe(true);
  });

  test("caps the chart at the last 12 readings", () => {
    const rows: MeterHistorySource[] = [source({ id: 0, clientId: 1, readingValue: 0, readingDate: "2026-01-01", isOpening: true })];
    for (let i = 1; i <= 20; i++) {
      rows.push(
        source({
          id: i,
          clientId: 1,
          readingValue: i,
          unitsConsumed: 1,
          readingDate: `2026-${String(((i - 1) % 12) + 1).padStart(2, "0")}-15`,
        }),
      );
    }
    const history = buildMeterHistory(1, rows);
    expect(history.chart).toHaveLength(12);
    expect(history.billedCount).toBe(20);
  });
});

describe("date helpers", () => {
  test("addDaysISO crosses months and formats readings", () => {
    expect(addDaysISO("2026-11-02", 14)).toBe("2026-11-16");
    expect(addDaysISO("2026-12-25", 14)).toBe("2027-01-08");
  });
});
