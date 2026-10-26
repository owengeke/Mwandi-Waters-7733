import { describe, expect, test } from "bun:test";
import { darajaPhone, demoCheckoutId, demoReceipt, outstandingKes, stkAmount } from "./mpesa";

describe("stkAmount", () => {
  test("keeps whole-shilling balances unchanged", () => {
    expect(stkAmount(1560)).toBe(1560);
    expect(stkAmount(0)).toBe(0);
  });

  test("rounds sub-shilling balances up so STK can charge them", () => {
    expect(stkAmount(3412.5)).toBe(3413);
    expect(stkAmount(0.5)).toBe(1);
    expect(stkAmount(2310.01)).toBe(2311);
  });

  test("does not turn float noise into an extra shilling", () => {
    expect(stkAmount(2310.0000000000005)).toBe(2310);
  });
});

describe("outstandingKes", () => {
  test("subtracts partial payments", () => {
    expect(outstandingKes(2760, 1200)).toBe(1560);
  });

  test("never goes negative", () => {
    expect(outstandingKes(2310, 2310)).toBe(0);
    expect(outstandingKes(1000, 1200)).toBe(0);
  });

  test("preserves cents", () => {
    expect(outstandingKes(3412.5, 1000)).toBe(2412.5);
  });
});

describe("darajaPhone", () => {
  test("normalises E.164 and local formats to MSISDN", () => {
    expect(darajaPhone("+254 712 345 678")).toBe("254712345678");
    expect(darajaPhone("0712345678")).toBe("0712345678");
  });
});

describe("demo identifiers", () => {
  test("receipts satisfy the production receipt validator", () => {
    for (let i = 0; i < 25; i++) {
      const receipt = demoReceipt();
      expect(receipt).toMatch(/^[A-Z0-9]{8,12}$/);
      expect(receipt.startsWith("DEMO")).toBe(true);
    }
  });

  test("checkout ids cannot collide with Daraja ids", () => {
    expect(demoCheckoutId()).toMatch(/^ws_CO_DEMO_[0-9a-f-]{36}$/);
  });
});
