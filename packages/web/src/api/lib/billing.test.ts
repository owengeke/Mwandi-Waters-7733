import { describe, expect, test } from "bun:test";
import { TARIFF_PER_UNIT_KES, calcAmountDue } from "../lib/billing";

describe("calcAmountDue", () => {
  test("units x tariff", () => {
    expect(calcAmountDue(15.4)).toBe(2310);
    expect(calcAmountDue(18.4)).toBe(2760);
    expect(calcAmountDue(19.75)).toBe(2962.5);
  });

  test("tariff snapshot constant", () => {
    expect(TARIFF_PER_UNIT_KES).toBe(150);
  });

  test("zero units", () => {
    expect(calcAmountDue(0)).toBe(0);
  });

  test("rounds to 2dp", () => {
    expect(calcAmountDue(1 / 3)).toBe(Math.round((1 / 3) * 150 * 100) / 100);
  });
});