import { describe, expect, test } from "bun:test";
import { isKenyanPhone, maskPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  test("accepts 07XX, 01XX, 2547XX and +2547XX as the same number", () => {
    for (const input of ["0712345678", "254712345678", "+254712345678", "0712 345 678", "0712-345-678"]) {
      expect(normalizePhone(input)).toBe("+254712345678");
    }
    for (const input of ["0110556677", "254110556677", "+254110556677"]) {
      expect(normalizePhone(input)).toBe("+254110556677");
    }
  });

  test("rejects numbers that are not Kenyan mobiles", () => {
    for (const input of ["", "abc", "0812345678", "071234567", "07123456789", "+255712345678"]) {
      expect(normalizePhone(input)).toBeNull();
    }
  });

  test("isKenyanPhone mirrors normalizePhone", () => {
    expect(isKenyanPhone("0712345678")).toBe(true);
    expect(isKenyanPhone("0812345678")).toBe(false);
  });
});

describe("maskPhone", () => {
  test("keeps the prefix and last three digits only", () => {
    expect(maskPhone("+254712345678")).toBe("+254 712 *** 678");
  });
});