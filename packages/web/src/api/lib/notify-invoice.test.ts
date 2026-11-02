import { describe, expect, test } from "bun:test";
import { composeInvoiceMessage, previousReadingLine } from "./notify-invoice";

describe("previousReadingLine", () => {
  test("shows previous units, current units and the change", () => {
    expect(previousReadingLine(18, 21)).toBe("Previous: 18 units, now 21 units (+3).");
    expect(previousReadingLine(21, 18)).toBe("Previous: 21 units, now 18 units (-3).");
    expect(previousReadingLine(18, 18)).toBe("Previous: 18 units, now 18 units (0).");
  });

  test("omits the sentence for a first reading", () => {
    expect(previousReadingLine(null, 21)).toBe("");
  });
});

describe("composeInvoiceMessage", () => {
  test("keeps the invoice details and adds the previous reading", () => {
    const message = composeInvoiceMessage({
      client: { fullName: "Mary Wanjiru", phoneNumber: "+254719709885" },
      invoice: {
        invoiceNumber: "INV-00002",
        consumptionUnits: 21,
        amountDueKes: 3150,
        dueDate: "2026-11-30",
      },
      periodLabel: "16–30 Nov 2026",
      previousUnits: 18,
    });

    expect(message).toContain("Mary");
    expect(message).toContain("INV-00002");
    expect(message).toContain("16–30 Nov 2026");
    expect(message).toContain("21 units");
    expect(message).toContain("KES 3,150.00");
    expect(message).toContain("Previous: 18 units, now 21 units (+3).");
  });

  test("first reading has no previous sentence", () => {
    const message = composeInvoiceMessage({
      client: { fullName: "Mary Wanjiru", phoneNumber: "+254719709885" },
      invoice: {
        invoiceNumber: "INV-00001",
        consumptionUnits: 12,
        amountDueKes: 1800,
        dueDate: "2026-11-30",
      },
      periodLabel: "1–15 Nov 2026",
      previousUnits: null,
    });

    expect(message).toContain("12 units");
    expect(message).not.toContain("Previous:");
  });
});
