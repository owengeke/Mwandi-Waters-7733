import { beforeEach, describe, expect, test } from "bun:test";
import { rateLimit, requestKey, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  test("allows up to the limit inside the window, then blocks", () => {
    const now = 1_000_000;
    expect(rateLimit("ip:a", 3, 60_000, now)).toBe(true);
    expect(rateLimit("ip:a", 3, 60_000, now + 1)).toBe(true);
    expect(rateLimit("ip:a", 3, 60_000, now + 2)).toBe(true);
    expect(rateLimit("ip:a", 3, 60_000, now + 3)).toBe(false);
  });

  test("resets after the window", () => {
    const now = 1_000_000;
    expect(rateLimit("ip:b", 1, 60_000, now)).toBe(true);
    expect(rateLimit("ip:b", 1, 60_000, now + 1)).toBe(false);
    expect(rateLimit("ip:b", 1, 60_000, now + 60_000)).toBe(true);
  });

  test("keeps separate keys independent", () => {
    const now = 1_000_000;
    expect(rateLimit("ip:c", 1, 60_000, now)).toBe(true);
    expect(rateLimit("ip:d", 1, 60_000, now)).toBe(true);
    expect(rateLimit("ip:c", 1, 60_000, now)).toBe(false);
    expect(rateLimit("ip:d", 1, 60_000, now)).toBe(false);
  });

  test("requestKey uses the first forwarded hop and otherwise falls back", () => {
    expect(requestKey(new Headers({ "x-forwarded-for": "41.90.1.2, 10.0.0.1" }), "get")).toBe("get:41.90.1.2");
    expect(requestKey(new Headers({ "x-real-ip": "41.90.1.3" }), "get")).toBe("get:41.90.1.3");
    expect(requestKey(new Headers(), "get")).toBe("get:local");
  });
});