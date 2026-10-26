import { randomInt, randomUUID } from "node:crypto";
import { toCents } from "./money";

/**
 * Pure M-Pesa helpers (no network, no env) so they can be unit tested and
 * reused by the routes, the Daraja client and the UI.
 */

/** Outstanding amount in KES, never negative. */
export const outstandingKes = (amountDueKes: number, amountPaidKes: number) =>
  Math.max(0, toCents(amountDueKes) - toCents(amountPaidKes)) / 100;

/**
 * Daraja only accepts whole shillings. Round a sub-shilling balance up; the
 * extra cents become account credit through the normal ledger logic.
 */
export const stkAmount = (outstanding: number) => Math.ceil(Math.round(outstanding * 100) / 100);

/** +254 712 345 678 → 254712345678 (the MSISDN format Daraja expects). */
export const darajaPhone = (phone: string) => phone.replace(/\D/g, "");

/** M-Pesa receipt alphabet — no I/O to avoid transcription mistakes. */
const RECEIPT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/** A 10-character demo receipt that satisfies the production receipt validator. */
export function demoReceipt() {
  let code = "DEMO";
  for (let i = 0; i < 6; i++) code += RECEIPT_ALPHABET[randomInt(RECEIPT_ALPHABET.length)];
  return code;
}

/** A CheckoutRequestID that can never collide with a real Daraja response. */
export const demoCheckoutId = () => `ws_CO_DEMO_${randomUUID()}`;
