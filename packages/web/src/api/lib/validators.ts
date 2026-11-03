import { z } from "zod";
import { normalizePhone } from "./phone";

/** Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX → normalises to +254XXXXXXXXX. */
export const kenyanPhone = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, "Enter a valid Kenyan phone number")
  .transform((v) => normalizePhone(v) as string);

/** Optional email: omitted or an empty string both mean "not provided". */
export const optionalEmail = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().toLowerCase().email("Enter a valid email address").max(160).optional(),
  )
  .optional();

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** M-Pesa receipt codes: 10 uppercase alphanumerics in production (e.g. QX891234AB); accept 8–12. */
export const mpesaReceipt = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8,12}$/, "Invalid M-Pesa receipt code");

const twoDp = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
export const kes = z.number().nonnegative().max(100_000_000).refine(twoDp, "Max 2 decimal places");
export const positiveKes = z.number().positive().max(100_000_000).refine(twoDp, "Max 2 decimal places");

/**
 * A physical meter reading: non-negative, at most 2 decimal places, rounded to
 * hundredths. Cumulative meters can run high, so the ceiling is generous.
 */
export const readingValue = z
  .number()
  .finite()
  .nonnegative("Reading must be non-negative")
  .max(10_000_000, "Reading looks too high")
  .refine(twoDp, "Max 2 decimal places")
  .transform((v) => Math.round(v * 100) / 100);

export const idInput = z.object({ id: z.number().int().positive() });

export const pagination = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});