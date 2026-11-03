/**
 * Small in-process fixed-window limiter for the unauthenticated onboarding
 * endpoints. Serverless instances each keep their own window, which is enough
 * to stop link guessing and form spam without adding a database round-trip.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastPrune = 0;

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Returns true when the call is allowed. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (now - lastPrune > 60_000) {
    prune(now);
    lastPrune = now;
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

/** Test helper — clears every window. */
export function resetRateLimits() {
  buckets.clear();
  lastPrune = 0;
}

/** First client hop in a proxy chain, or a stable placeholder in local/dev tests. */
export function requestKey(headers: Headers, scope: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  return `${scope}:${forwarded || real || "local"}`;
}