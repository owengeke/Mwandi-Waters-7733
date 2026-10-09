/** Integer-cent arithmetic for KES so we never accumulate float drift. */
export const toCents = (kes: number) => Math.round(kes * 100);
export const fromCents = (cents: number) => cents / 100;
export const roundKes = (kes: number) => fromCents(toCents(kes));
export const addKes = (...values: number[]) => fromCents(values.reduce((s, v) => s + toCents(v), 0));
export const subKes = (a: number, b: number) => fromCents(toCents(a) - toCents(b));
