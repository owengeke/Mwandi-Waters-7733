import { describe, expect, test } from "bun:test";
import { accountNumber, invoiceNumber, meterNumber, pending, requestRef } from "./identifiers";
import { nextAccountNumber, nextMeterNumber } from "./numbering";

describe("identifiers", () => {
  test("keeps the existing ACC/REQ/MTR/INV formats", () => {
    expect(requestRef(42)).toBe("REQ-0042");
    expect(accountNumber(4)).toBe("ACC-0004");
    expect(meterNumber(9)).toBe("MTR-0009");
    expect(invoiceNumber(2)).toBe("INV-00002");
  });

  test("grows naturally past four digits", () => {
    expect(accountNumber(10000)).toBe("ACC-10000");
    expect(meterNumber(10000)).toBe("MTR-10000");
  });

  test("placeholder references are unique", () => {
    const first = pending();
    expect(first.startsWith("PENDING-")).toBe(true);
    expect(first).not.toBe(pending());
  });
});

describe("nextAccountNumber / nextMeterNumber", () => {
  test("increments without gaps from the highest existing number", () => {
    let max = 4;
    const assigned = Array.from({ length: 5 }, () => nextAccountNumber(max++));
    expect(assigned).toEqual(["ACC-0005", "ACC-0006", "ACC-0007", "ACC-0008", "ACC-0009"]);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  test("never reuses a supplied high meter", () => {
    expect(nextMeterNumber(1042)).toBe("MTR-1043");
    expect(nextMeterNumber(1043)).toBe("MTR-1044");
    expect(nextMeterNumber(1042)).not.toBe(nextMeterNumber(1043));
  });
});