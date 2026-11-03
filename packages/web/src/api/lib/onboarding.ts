import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  OCCUPANT_TYPES,
  PROPERTY_TYPES,
  type Client,
  type InstallationRequest,
  type InstallationStatus,
  type OccupantType,
  type OnboardingToken,
  type PropertyType,
} from "../database/schema";
import { kenyanPhone, optionalEmail } from "./validators";

/** One generic message for missing, expired and already-used links. */
export const INVALID_ONBOARDING_LINK = "This link is no longer valid. Contact us for a new one.";

export const ONBOARDING_TOKEN_TTL_DAYS = 7;
export const ONBOARDING_TOKEN_TTL_MS = ONBOARDING_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export type OnboardingStep = 1 | 2 | 3 | 4;
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [1, 2, 3, 4];

/** SHA-256 of the raw URL token. Only this value is ever persisted. */
export function hashOnboardingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 32 random bytes, URL-safe. Returns the raw token (to put in the link) and the
 * hash to store. The raw token must never be logged.
 */
export function createOnboardingToken(now = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashOnboardingToken(token),
    expiresAt: new Date(now.getTime() + ONBOARDING_TOKEN_TTL_MS),
  };
}

/** A token can be used until it is marked used or passes its expiry. */
export function isOnboardingTokenUsable(
  row: Pick<OnboardingToken, "usedAt" | "expiresAt">,
  now = new Date(),
): boolean {
  if (row.usedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

// ---------- Step validation ----------
/** Step 1 — confirm name and add an optional email. Phone is already known. */
export const onboardingStep1 = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: optionalEmail,
});

/**
 * Step 2 — property profile. The occupant choice only applies to commercial
 * premises, so it is optional here; `normalizeOccupancy` fills in the rule
 * (residential is always owner-occupied) when the step is saved.
 */
export const onboardingStep2 = z.object({
  propertyType: z.enum(PROPERTY_TYPES, { message: "Choose residential or commercial" }),
  occupantType: z.enum(OCCUPANT_TYPES, { message: "Choose owner or tenant" }).optional(),
  estate: z.string().trim().min(1, "Enter the estate or area").max(120),
  plotOrHouseNo: z.string().trim().min(1, "Enter the plot or house number").max(60),
  landmark: z.string().trim().min(1, "Enter the nearest landmark").max(160),
  landlordPhone: kenyanPhone.optional(),
});

/** Step 3 — both consents are required. */
export const onboardingStep3 = z.object({
  whatsappConsent: z.boolean().refine((v) => v === true, "Agree to receive bills and receipts on WhatsApp"),
  billingUseConsent: z.boolean().refine((v) => v === true, "Agree to the use of your details for billing"),
});

/** Step 4 — at least 8 characters; hashed with the app's sign-in hashing. */
export const onboardingStep4 = z.object({
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "That password is too long"),
});

export const onboardingStepData = z.union([
  onboardingStep1,
  onboardingStep2,
  onboardingStep3,
  onboardingStep4,
]);

// ---------- Progress + public projections ----------
export interface OnboardingProgress {
  completedSteps: OnboardingStep[];
  currentStep: OnboardingStep;
  completed: boolean;
}

type ProgressSource = Pick<
  InstallationRequest,
  "propertyType" | "occupantType" | "whatsappConsentAt" | "passwordHash"
>;

/**
 * Step 1 is complete from the start because the application already holds the
 * applicant's name and phone. Steps 2–4 are inferred from their saved fields,
 * which is what lets someone close the page and resume at the same step.
 */
export function onboardingProgress(row: ProgressSource): OnboardingProgress {
  const completedSteps: OnboardingStep[] = [1];
  if (row.propertyType && row.occupantType) completedSteps.push(2);
  if (row.whatsappConsentAt) completedSteps.push(3);
  if (row.passwordHash) completedSteps.push(4);

  const firstIncomplete = ONBOARDING_STEPS.find((step) => !completedSteps.includes(step));
  return {
    completedSteps,
    currentStep: firstIncomplete ?? 4,
    completed: firstIncomplete === undefined,
  };
}

export interface OnboardingDetails {
  fullName: string;
  email: string | null;
  phoneNumber: string;
  propertyType: PropertyType | null;
  occupantType: OccupantType | null;
  estate: string | null;
  plotOrHouseNo: string | null;
  landmark: string | null;
  landlordPhone: string | null;
  whatsappConsent: boolean;
  hasPassword: boolean;
}

export interface ApplicationOnboardingView {
  kind: "application";
  referenceNumber: string;
  status: InstallationStatus;
  feePaid: boolean;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  completed: boolean;
  /** The token holder's own saved fields only. */
  details: OnboardingDetails;
}

/**
 * Public response for a valid application token. Every field comes from this
 * one application: there is no join and no caller-supplied identifier, so it
 * cannot return another applicant's data.
 */
export function applicationOnboardingView(row: InstallationRequest): ApplicationOnboardingView {
  const progress = onboardingProgress(row);
  return {
    kind: "application",
    referenceNumber: row.referenceNumber,
    status: row.status,
    feePaid: row.status === "PAID" || row.status === "INSTALLED",
    currentStep: progress.currentStep,
    completedSteps: progress.completedSteps,
    completed: progress.completed,
    details: {
      fullName: row.fullName,
      email: row.email,
      phoneNumber: row.phoneNumber,
      propertyType: row.propertyType,
      occupantType: row.occupantType,
      estate: row.estate,
      plotOrHouseNo: row.plotOrHouseNo,
      landmark: row.landmark,
      landlordPhone: row.landlordPhone,
      whatsappConsent: row.whatsappConsentAt !== null,
      hasPassword: row.passwordHash !== null,
    },
  };
}

export interface ClientSetPasswordView {
  kind: "client";
  referenceNumber: string;
  status: "INSTALLED";
  feePaid: true;
  currentStep: 4;
  completedSteps: OnboardingStep[];
  completed: boolean;
  details: {
    fullName: string;
    email: string | null;
    phoneNumber: string;
    hasPassword: boolean;
  };
}

/** Public response for a client set-password link created with a walk-in client. */
export function clientSetPasswordView(client: Client): ClientSetPasswordView {
  return {
    kind: "client",
    referenceNumber: client.accountNumber,
    status: "INSTALLED",
    feePaid: true,
    currentStep: 4,
    completedSteps: [],
    completed: false,
    details: {
      fullName: client.fullName,
      email: client.email,
      phoneNumber: client.phoneNumber,
      hasPassword: false,
    },
  };
}