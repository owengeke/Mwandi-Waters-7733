import { describe, expect, test } from "bun:test";
import {
  daysInMonth,
  listWindows,
  shiftWindow,
  stepWindow,
  windowContaining,
  windowFor,
  windowLabel,
  windowStartForDate,
} from "./usage-period";

describe("15-day windows", () => {
  test("first and second half of a month", () => {
    expect(windowFor("2026-11", "FIRST")).toEqual({ start: "2026-11-01", end: "2026-11-15" });
    expect(windowFor("2026-11", "SECOND")).toEqual({ start: "2026-11-16", end: "2026-11-30" });
  });

  test("February and leap years use the real month end", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(windowFor("2026-02", "SECOND")).toEqual({ start: "2026-02-16", end: "2026-02-28" });
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(windowFor("2028-02", "SECOND")).toEqual({ start: "2028-02-16", end: "2028-02-29" });
  });

  test("a date belongs to the first half through the 15th, then the 16th", () => {
    expect(windowStartForDate("2026-11-01")).toBe("2026-11-01");
    expect(windowStartForDate("2026-11-15")).toBe("2026-11-01");
    expect(windowStartForDate("2026-11-16")).toBe("2026-11-16");
    expect(windowStartForDate("2026-11-30")).toBe("2026-11-16");
    expect(windowContaining("2026-11-15").start).toBe("2026-11-01");
    expect(windowContaining("2026-11-16").start).toBe("2026-11-16");
  });

  test("steps across month and year boundaries", () => {
    expect(stepWindow("2026-11-01", 1)).toEqual({ start: "2026-11-16", end: "2026-11-30" });
    expect(stepWindow("2026-11-16", 1)).toEqual({ start: "2026-12-01", end: "2026-12-15" });
    expect(stepWindow("2026-12-16", 1)).toEqual({ start: "2027-01-01", end: "2027-01-15" });
    expect(stepWindow("2026-01-01", -1)).toEqual({ start: "2025-12-16", end: "2025-12-31" });
    expect(shiftWindow("2026-11-16", -1).start).toBe("2026-11-01");
    expect(shiftWindow("2026-01-16", -2).start).toBe("2025-12-16");
  });

  test("lists inclusive windows in order", () => {
    expect(listWindows("2026-09-01", "2026-10-16").map((w) => w.start)).toEqual([
      "2026-09-01",
      "2026-09-16",
      "2026-10-01",
      "2026-10-16",
    ]);
    expect(listWindows("2026-11-16", "2026-11-01")).toEqual([]);
  });

  test("human labels collapse the shared month and year", () => {
    expect(windowLabel(windowFor("2026-11", "FIRST"))).toBe("1–15 Nov 2026");
    expect(windowLabel(windowFor("2026-11", "SECOND"))).toBe("16–30 Nov 2026");
    expect(windowLabel(windowFor("2028-02", "SECOND"))).toBe("16–29 Feb 2028");
  });
});
