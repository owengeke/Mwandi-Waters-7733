import type { InstallationStatus } from "../database/schema";

/**
 * Public-safe projections.
 *
 * Anything reachable without a session must go through one of these shapes: no
 * client name, phone number, address, estate or free-text note. Keeping the
 * projection in one place makes it easy to test and hard to accidentally widen.
 */

export interface PublicTrackingView {
  referenceNumber: string;
  status: InstallationStatus;
  /** Only quoted once the application is approved and awaiting payment. */
  installationFeeKes: number | null;
}

interface TrackableApplication {
  referenceNumber: string;
  status: InstallationStatus;
  installationFeeKes: number;
}

/** The only fields the public "Track Application" lookup may return. */
export function publicTrackingView(row: TrackableApplication): PublicTrackingView {
  return {
    referenceNumber: row.referenceNumber,
    status: row.status,
    installationFeeKes: row.status === "APPROVED_PENDING_PAYMENT" ? row.installationFeeKes : null,
  };
}

/**
 * "Wanjiru Kamau" → "Wanjiru K.".
 *
 * Receipts opened without a session show a masked name only: the first name
 * plus the initial of the last name, never the full name.
 */
export function maskCustomerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const lastInitial = parts[parts.length - 1]![0]!.toUpperCase();
  return `${first} ${lastInitial}.`;
}