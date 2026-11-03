import { describe, expect, test } from "bun:test";
import { MIN_PASSWORD_LENGTH, isPasswordValid, passwordStrength } from "./password";

describe("passwordStrength", () => {
  test("treats anything shorter than the minimum as unusable", () => {
    expect(passwordStrength("")).toEqual({
      score: 0,
      label: "Too short",
      hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
    expect(passwordStrength("abc1234").score).toBe(0);
    expect(passwordStrength("abcdefgh").score).toBe(1);
  });

  test("rewards length and character variety without exceeding four bars", () => {
    expect(passwordStrength("abcdefgh").label).toBe("Weak");
    expect(passwordStrength("abcdefghi1").score).toBe(2);
    expect(passwordStrength("Abcdefgh1234").score).toBe(3);
    expect(passwordStrength("A-longer-phrase-42!").score).toBe(4);
  });

  test("lets a long passphrase reach the top score", () => {
    const strength = passwordStrength("my little water meter 2");
    expect(strength.score).toBe(4);
    expect(strength.label).toBe("Strong");
  });
});

describe("isPasswordValid", () => {
  test("accepts 8–128 characters", () => {
    expect(isPasswordValid("1234567")).toBe(false);
    expect(isPasswordValid("12345678")).toBe(true);
    expect(isPasswordValid("a".repeat(128))).toBe(true);
    expect(isPasswordValid("a".repeat(129))).toBe(false);
  });
});
