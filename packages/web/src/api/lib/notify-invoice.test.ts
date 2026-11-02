import { describe, expect, test } from "bun:test";
import { composeInvoiceMessage, readingsLine } from "./notify-invoice";

describe("readingsLine", () => {
  test("shows previous, current and units used", () => {
    expect(readingsLine(15, 32, 17)).toBe(
      "Previous reading 15; current reading 32; 17 units used.",
    );
    expect(readingsLine(22.75, 31.95, 9.2)).toBe(
      "Previous reading 22.75; current reading 31.95; 9.2 units used.",
    );
  });

  test("labels the very first reading", () => {
    expect(readingsLine(null, 2, 2)).toBe("First reading; current reading 2; 2 units used.");
  });
});

describe("composeInvoiceMessage", () => {
  test("keeps the invoice details and adds the readings", () => {
    const message = composeInvoiceMessage({
      client: { fullName: "Mary Wanjiru", phoneNumber: "+254719709885" },
      invoice: {
        invoiceNumber: "INV-00002",
        consumptionUnits: 17,
        amountDueKes: 2550,
        dueDate: "2026-11-16",
      },
      readingDate: "2026-11-02",
      previousReading: 15,
      currentReading: 32,
    });

    expect(message).toContain("Mary");
    expect(message).toContain("INV-00002");
    expect(message).toContain("2 Nov 2026");
    expect(message).toContain("17 units");
    expect(message).toContain("KES 2,550.00");
    expect(message).toContain("Previous reading 15; current reading 32; 17 units used.");
  });

  test("first reading has no previous value", () => {
    const message = composeInvoiceMessage({
      client: { fullName: "Mary Wanjiru", phoneNumber: "+254719709885" },
      invoice: {
        invoiceNumber: "INV-00001",
        consumptionUnits: 12,
        amountDueKes: 1800,
        dueDate: "2026-11-16",
      },
      readingDate: "2026-11-02",
      previousReading: null,
      currentReading: 12,
    });

    expect(message).toContain("12 units");
    expect(message).toContain("First reading; current reading 12; 12 units used.");
    expect(message).not.toContain("Previous reading");
  });
});
