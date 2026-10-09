import { z } from "zod";

/** Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX → normalises to +254XXXXXXXXX. */
export const kenyanPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^(?:\+?254|0)[17]\d{8}$/.test(v), "Enter a valid Kenyan phone number")
  .transform((v) => "+254" + v.replace(/^(?:\+?254|0)/, ""));

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

export const idInput = z.object({ id: z.number().int().positive() });

export const pagination = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
