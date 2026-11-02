import { describe, expect, test } from "bun:test";
import { buildUsageHistory, type UsageInvoiceLike } from "./usage-history";

let sequence = 0;

function row(
  clientId: number,
  start: string,
  end: string,
  units: number,
  extra: Partial<UsageInvoiceLike> = {},
): UsageInvoiceLike {
  sequence += 1;
  return {
    clientId,
    billingPeriodStart: start,
    billingPeriodEnd: end,
    consumptionUnits: units,
    amountDueKes: Math.round(units * 150 * 100) / 100,
    invoiceNumber: `INV-${String(sequence).padStart(5, "0")}`,
    status: "UNPAID",
    issuedAt: new Date(`${start}T10:00:00Z`),
    createdAt: new Date(`${start}T09:00:00Z`),
    ...extra,
  };
}

describe("buildUsageHistory", () => {
  test("only ever returns the requested client's data", () => {
    const history = buildUsageHistory(
      1,
      [
        row(1, "2026-10-01", "2026-10-15", 10),
        row(2, "2026-10-16", "2026-10-31", 99),
        row(2, "2026-11-01", "2026-11-15", 120),
      ],
      { today: "2026-11-10" },
    );

    expect(history.clientId).toBe(1);
    expect(history.periods.map((p) => p.windowStart)).toEqual([
      "2026-11-01",
      "2026-10-16",
      "2026-10-01",
    ]);
    expect(history.periods.map((p) => p.units)).toEqual([null, null, 10]);
    expect(history.latest?.units).toBe(10);
  });

  test("groups invoices into 15-day windows with amount and change", () => {
    const history = buildUsageHistory(
      7,
      [
        row(7, "2026-10-01", "2026-10-15", 10),
        row(7, "2026-10-16", "2026-10-31", 12),
      ],
      { today: "2026-10-20" },
    );

    const [latest, previous] = history.periods;
    expect(latest).toMatchObject({
      windowStart: "2026-10-16",
      windowEnd: "2026-10-31",
      units: 12,
      amountKes: 1800,
      changeUnits: 2,
      previousUnits: 10,
      isLatest: true,
      hasReading: true,
    });
    expect(previous).toMatchObject({
      windowStart: "2026-10-01",
      windowEnd: "2026-10-15",
      units: 10,
      amountKes: 1500,
      changeUnits: null,
      isLatest: false,
    });
    expect(history.latest?.windowStart).toBe("2026-10-16");
  });

  test("fills empty windows with 'No reading yet' and skips them for change", () => {
    const history = buildUsageHistory(
      7,
      [
        row(7, "2026-09-01", "2026-09-15", 18),
        row(7, "2026-11-01", "2026-11-15", 21),
      ],
      { today: "2026-11-10" },
    );

    expect(history.periods.map((p) => p.windowStart)).toEqual([
      "2026-11-01",
      "2026-10-16",
      "2026-10-01",
      "2026-09-16",
      "2026-09-01",
    ]);

    const empty = history.periods.filter((p) => !p.hasReading);
    expect(empty.map((p) => p.windowStart)).toEqual(["2026-10-16", "2026-10-01", "2026-09-16"]);
    for (const period of empty) {
      expect(period.units).toBeNull();
      expect(period.amountKes).toBeNull();
      expect(period.changeUnits).toBeNull();
      expect(period.invoiceNumber).toBeNull();
    }

    expect(history.periods[0]).toMatchObject({
      units: 21,
      changeUnits: 3,
      previousUnits: 18,
      isLatest: true,
    });
  });

  test("a client with no readings gets one empty current window", () => {
    const history = buildUsageHistory(7, [], { today: "2026-11-10" });

    expect(history.periods).toHaveLength(1);
    expect(history.periods[0]).toMatchObject({
      windowStart: "2026-11-01",
      windowEnd: "2026-11-15",
      hasReading: false,
      units: null,
    });
    expect(history.latest).toBeNull();
  });

  test("legacy monthly invoices do not create a phantom second window", () => {
    const history = buildUsageHistory(
      7,
      [row(7, "2026-09-01", "2026-09-30", 18, { status: "PAID" })],
      { today: "2026-10-05" },
    );

    expect(history.periods.map((p) => p.windowStart)).toEqual(["2026-10-01", "2026-09-01"]);
    const legacy = history.periods[1];
    expect(legacy).toMatchObject({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      windowStart: "2026-09-01",
      units: 18,
      amountKes: 2700,
    });
  });

  test("caps the list at maxPeriods, keeping the latest windows", () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      row(7, `2026-0${i + 1}-01`, `2026-0${i + 1}-15`, i + 1),
    );
    const history = buildUsageHistory(7, rows, { today: "2026-06-20", maxPeriods: 4 });

    expect(history.periods).toHaveLength(4);
    expect(history.periods[0].windowStart).toBe("2026-06-16");
    expect(history.periods.at(-1)?.windowStart).toBe("2026-05-01");
  });

  test("uses the invoice amount and falls back to the tariff when absent", () => {
    const history = buildUsageHistory(
      7,
      [
        row(7, "2026-11-01", "2026-11-15", 2.5, { amountDueKes: 375 }),
        row(7, "2026-10-16", "2026-10-31", 2, { amountDueKes: null }),
      ],
      { today: "2026-11-20" },
    );

    expect(history.periods.find((p) => p.windowStart === "2026-11-01")?.amountKes).toBe(375);
    expect(history.periods.find((p) => p.windowStart === "2026-10-16")?.amountKes).toBe(300);
  });
});
