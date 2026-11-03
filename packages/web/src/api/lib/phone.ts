/**
 * Kenyan mobile number normalisation.
 *
 * Accepts 07XXXXXXXX, 01XXXXXXXX, 254XXXXXXXXX and +254XXXXXXXXX (spaces,
 * dashes, dots and brackets are ignored) and returns the canonical
 * +2547XXXXXXXX / +2541XXXXXXXX form already stored in the database.
 *
 * Keeping the `+254` prefix (rather than bare 254…) preserves one-phone-one-login
 * with the existing `user.phone_number` and `clients.phone_number` rows.
 */
const KENYAN_MOBILE = /^(?:\+?254|0)([17]\d{8})$/;

export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, "");
  const match = KENYAN_MOBILE.exec(compact);
  return match ? `+254${match[1]}` : null;
}

export const isKenyanPhone = (input: string): boolean => normalizePhone(input) !== null;

/** +254712345678 → +254 712 *** 678 (safe for public display). */
export function maskPhone(phone: string): string {
  return phone.replace(/^(\+254)(\d{3})\d{3}(\d{3})$/, "$1 $2 *** $3");
}