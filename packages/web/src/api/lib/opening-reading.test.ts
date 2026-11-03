import { describe, expect, test } from "bun:test";
import { openingReadingRow } from "./meter-readings";

describe("openingReadingRow", () => {
  test("starts a meter chain with zero units and no invoice", () => {
    const row = openingReadingRow({
      clientId: 9,
      reading: 2,
      readingDate: "2026-11-03",
      recordedBy: "staff@mwandiwaters.co.ke",
      meterNumber: "MTR-0009",
    });

    expect(row).toEqual({
      clientId: 9,
      readingValue: 2,
      previousReading: 2,
      unitsConsumed: 0,
      readingDate: "2026-11-03",
      recordedBy: "staff@mwandiwaters.co.ke",
      invoiceId: null,
      isOpening: true,
      meterNumber: "MTR-0009",
    });
  });

  test("rounds to 2 decimal places and never carries a charge", () => {
    const row = openingReadingRow({ clientId: 1, reading: 2.005, readingDate: "2026-11-03" });
    expect(row.readingValue).toBe(2.01);
    expect(row.previousReading).toBe(2.01);
    expect(row.unitsConsumed).toBe(0);
    expect(row.invoiceId).toBeNull();
  });

  test("accepts zero (a brand-new meter)", () => {
    const row = openingReadingRow({ clientId: 1, reading: 0, readingDate: "2026-11-03" });
    expect(row.readingValue).toBe(0);
    expect(row.isOpening).toBe(true);
  });
});