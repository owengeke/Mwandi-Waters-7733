import { describe, expect, test } from "bun:test";
import type { InstallationStatus } from "../database/schema";
import { maskCustomerName, publicTrackingView } from "./privacy";
import { receiptDetailRows, type ReceiptPdfInput } from "./receipt";

interface ApplicationRow {
  referenceNumber: string;
  fullName: string;
  phoneNumber: string;
  physicalAddress: string;
  status: InstallationStatus;
  installationFeeKes: number;
  rejectionReason: string | null;
}

const application: ApplicationRow = {
  referenceNumber: "REQ-0042",
  fullName: "Amina Hassan",
  phoneNumber: "+254733998877",
  physicalAddress: "Nyali Road, Mombasa",
  status: "APPROVED_PENDING_PAYMENT",
  installationFeeKes: 6500,
  rejectionReason: "Plot is outside the service area",
};

describe("publicTrackingView", () => {
  test("returns only the reference, status and quoted fee", () => {
    const view = publicTrackingView(application);
    expect(Object.keys(view).sort()).toEqual(["installationFeeKes", "referenceNumber", "status"]);
    expect(view).toEqual({
      referenceNumber: "REQ-0042",
      status: "APPROVED_PENDING_PAYMENT",
      installationFeeKes: 6500,
    });
  });

  test("never serialises the applicant's personal details", () => {
    const json = JSON.stringify(publicTrackingView(application));
    expect(json).not.toContain("Amina");
    expect(json).not.toContain("Hassan");
    expect(json).not.toContain("254733998877");
    expect(json).not.toContain("Nyali");
    expect(json).not.toContain("rejection");
  });

  test("hides the fee unless the application is awaiting payment", () => {
    for (const status of ["PENDING_REVIEW", "PAID", "INSTALLED", "REJECTED"] as InstallationStatus[]) {
      expect(publicTrackingView({ ...application, status }).installationFeeKes).toBeNull();
    }
  });
});

describe("maskCustomerName", () => {
  test("keeps the first name and last initial only", () => {
    expect(maskCustomerName("Wanjiru Kamau")).toBe("Wanjiru K.");
    expect(maskCustomerName("Amina Hassan")).toBe("Amina H.");
    expect(maskCustomerName("  Mary   Wanjiru  ")).toBe("Mary W.");
  });

  test("keeps a single name intact", () => {
    expect(maskCustomerName("Cher")).toBe("Cher");
  });
});

const receipt: ReceiptPdfInput = {
  paymentId: 7,
  receiptNumber: "DEMO1234",
  mpesaReference: "DEMO1234",
  amountKes: 1560,
  paidAt: new Date("2026-10-20T09:30:00Z"),
  channelLabel: "M-Pesa STK Push",
  accountNumber: "ACC-0001",
  meterNumber: "MTR-0001",
  customerName: "Wanjiru Kamau",
  phoneNumber: "+254712345678",
  invoiceNumber: "INV-00002",
  isDemo: true,
};

describe("receiptDetailRows", () => {
  test("the owner/operator receipt keeps full details", () => {
    const rows = Object.fromEntries(receiptDetailRows({ ...receipt, masked: false }));
    expect(rows.Customer).toBe("Wanjiru Kamau");
    expect(rows["Phone number"]).toBe("+254712345678");
  });

  test("a signed-out receipt masks the name and drops all contact/account details", () => {
    const rows = Object.fromEntries(receiptDetailRows({ ...receipt, masked: true }));
    expect(rows.Customer).toBe("Wanjiru K.");
    expect(rows["Phone number"]).toBeUndefined();
    expect(rows["Account number"]).toBeUndefined();
    expect(rows["Meter number"]).toBeUndefined();
    const json = JSON.stringify(rows);
    expect(json).not.toContain("254712345678");
    expect(json).not.toContain("Wanjiru Kamau");
    expect(json).not.toContain("ACC-0001");
    expect(json).not.toContain("MTR-0001");
  });
});