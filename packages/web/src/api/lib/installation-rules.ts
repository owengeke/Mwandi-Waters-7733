import type { InstallationRequest } from "../database/schema";

/**
 * Why an approved application cannot be installed yet. Returns null when the
 * applicant has completed every onboarding step.
 *
 * Pure and database-free so the rule can be unit tested in isolation.
 */
export function installationBlocker(
  req: Pick<InstallationRequest, "detailsCompletedAt" | "propertyType" | "occupantType">,
): string | null {
  if (!req.detailsCompletedAt) return "The client must complete their details before installation.";
  if (!req.propertyType || !req.occupantType) return "The client's property details are incomplete.";
  return null;
}