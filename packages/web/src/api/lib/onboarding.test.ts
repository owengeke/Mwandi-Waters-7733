import { describe, expect, test } from "bun:test";
import type { Client, InstallationRequest } from "../database/schema";
import {
  INVALID_ONBOARDING_LINK,
  ONBOARDING_TOKEN_TTL_DAYS,
  applicationOnboardingView,
  clientSetPasswordView,
  createOnboardingToken,
  hashOnboardingToken,
  isOnboardingTokenUsable,
  onboardingProgress,
  onboardingStep1,
  onboardingStep2,
  onboardingStep3,
  onboardingStep4,
} from "./onboarding";

describe("onboarding tokens", () => {
  test("generates a URL-safe token and stores only its SHA-256 hash", () => {
    const { token, tokenHash, expiresAt } = createOnboardingToken(new Date("2026-11-03T08:00:00Z"));

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashOnboardingToken(token)).toBe(tokenHash);
    expect(expiresAt.toISOString()).toBe("2026-11-10T08:00:00.000Z");
    expect(ONBOARDING_TOKEN_TTL_DAYS).toBe(7);

    expect(createOnboardingToken().token).not.toBe(token);
  });

  test("a token is usable until it expires or is marked used", () => {
    const { tokenHash, expiresAt } = createOnboardingToken(new Date("2026-11-03T08:00:00Z"));
    const fresh = { tokenHash, expiresAt, usedAt: null };

    expect(isOnboardingTokenUsable(fresh, new Date("2026-11-03T08:00:01Z"))).toBe(true);
    expect(isOnboardingTokenUsable(fresh, new Date("2026-11-10T08:00:00Z"))).toBe(false);
    expect(isOnboardingTokenUsable({ ...fresh, usedAt: new Date() }, new Date("2026-11-04T00:00:00Z"))).toBe(false);
  });

  test("the invalid-link message is fixed and contains no personal data", () => {
    expect(INVALID_ONBOARDING_LINK).toBe("This link is no longer valid. Contact us for a new one.");
  });
});

describe("onboardingProgress", () => {
  const base = { propertyType: null, occupantType: null, whatsappConsentAt: null, passwordHash: null };

  test("starts at step 2 because the application already has the name and phone", () => {
    expect(onboardingProgress(base)).toEqual({ completedSteps: [1], currentStep: 2, completed: false });
  });

  test("resumes at the first unsaved step", () => {
    expect(
      onboardingProgress({ ...base, propertyType: "residential", occupantType: "owner" }),
    ).toEqual({ completedSteps: [1, 2], currentStep: 3, completed: false });

    expect(
      onboardingProgress({
        ...base,
        propertyType: "residential",
        occupantType: "owner",
        whatsappConsentAt: new Date(),
      }),
    ).toEqual({ completedSteps: [1, 2, 3], currentStep: 4, completed: false });
  });

  test("is complete once the password is saved", () => {
    expect(
      onboardingProgress({
        propertyType: "commercial",
        occupantType: "owner",
        whatsappConsentAt: new Date(),
        passwordHash: "hash",
      }),
    ).toEqual({ completedSteps: [1, 2, 3, 4], currentStep: 4, completed: true });
  });
});

describe("step validation", () => {
  test("step 1 accepts an omitted or blank email", () => {
    expect(onboardingStep1.parse({ fullName: "Amina Hassan" }).email).toBeUndefined();
    expect(onboardingStep1.parse({ fullName: "Amina Hassan", email: "" }).email).toBeUndefined();
    expect(onboardingStep1.parse({ fullName: "Amina Hassan", email: "A@B.com" }).email).toBe("a@b.com");
    expect(onboardingStep1.safeParse({ fullName: "A" }).success).toBe(false);
    expect(onboardingStep1.safeParse({ fullName: "Amina Hassan", email: "nope" }).success).toBe(false);
  });

  test("step 2 needs a property type and rejects unknown values", () => {
    const valid = {
      propertyType: "commercial",
      occupantType: "tenant",
      estate: "Milimani",
      plotOrHouseNo: "B-12",
      landmark: "Milimani market",
      landlordPhone: "0733000111",
    };
    const parsed = onboardingStep2.parse(valid);
    expect(parsed.landlordPhone).toBe("+254733000111");
    expect(onboardingStep2.safeParse({ ...valid, propertyType: "industrial" }).success).toBe(false);
    expect(onboardingStep2.safeParse({ ...valid, occupantType: "landlord" }).success).toBe(false);
    expect(onboardingStep2.safeParse({ ...valid, estate: "" }).success).toBe(false);
  });

  test("step 2 may omit the occupant for a residential property", () => {
    const parsed = onboardingStep2.parse({
      propertyType: "residential",
      estate: "Kahawa Sukari",
      plotOrHouseNo: "14",
      landmark: "Kahawa Sukari shopping centre",
    });
    expect(parsed.occupantType).toBeUndefined();
  });

  test("step 3 requires both consents", () => {
    expect(onboardingStep3.safeParse({ whatsappConsent: true, billingUseConsent: true }).success).toBe(true);
    expect(onboardingStep3.safeParse({ whatsappConsent: true, billingUseConsent: false }).success).toBe(false);
    expect(onboardingStep3.safeParse({ whatsappConsent: false, billingUseConsent: true }).success).toBe(false);
    expect(onboardingStep3.safeParse({}).success).toBe(false);
  });

  test("step 4 rejects a password shorter than 8 characters", () => {
    expect(onboardingStep4.safeParse({ password: "1234567" }).success).toBe(false);
    expect(onboardingStep4.safeParse({ password: "12345678" }).success).toBe(true);
    expect(onboardingStep4.safeParse({ password: "x".repeat(129) }).success).toBe(false);
  });
});

const application = {
  id: 7,
  referenceNumber: "REQ-0042",
  fullName: "Amina Hassan",
  phoneNumber: "+254733998877",
  physicalAddress: "Nyali Road, Mombasa",
  status: "PAID",
  installationFeeKes: 12500,
  rejectionReason: "internal note",
  email: "amina@example.com",
  propertyType: "residential",
  occupantType: "owner",
  estate: "Nyali",
  plotOrHouseNo: "5",
  landmark: "Nyali Bridge",
  landlordPhone: null,
  whatsappConsentAt: new Date("2026-11-03T08:00:00Z"),
  detailsCompletedAt: new Date("2026-11-03T08:05:00Z"),
  passwordHash: "super-secret-hash",
  clientId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as InstallationRequest;

describe("public projections", () => {
  test("a valid application token returns only that applicant's own fields", () => {
    const view = applicationOnboardingView(application);
    expect(view.referenceNumber).toBe("REQ-0042");
    expect(view.feePaid).toBe(true);
    expect(view.currentStep).toBe(4);
    expect(view.completed).toBe(true);
    expect(view.details.fullName).toBe("Amina Hassan");
    expect(view.details.phoneNumber).toBe("+254733998877");
    expect(view.details.whatsappConsent).toBe(true);

    const json = JSON.stringify(view);
    expect(json).not.toContain("super-secret-hash");
    expect(json).not.toContain("internal note");
    expect(json).not.toContain("Nyali Road");
    expect(json).not.toContain("installationFeeKes");
    expect(json).not.toContain('"clientId"');
  });

  test("a client set-password token exposes no hash or unrelated fields", () => {
    const client = {
      id: 3,
      accountNumber: "ACC-0003",
      fullName: "Otieno Ochieng",
      phoneNumber: "+254722113344",
      email: null,
      meterNumber: "MTR-0003",
      currentBalanceKes: 0,
      status: "ACTIVE",
      propertyType: "commercial",
      occupantType: "tenant",
      estate: "Milimani",
      plotOrHouseNo: "B-12",
      landmark: "Milimani market",
      landlordPhone: null,
      createdVia: "walk_in",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Client;

    const view = clientSetPasswordView(client);
    expect(view).toEqual({
      kind: "client",
      referenceNumber: "ACC-0003",
      status: "INSTALLED",
      feePaid: true,
      currentStep: 4,
      completedSteps: [],
      completed: false,
      details: {
        fullName: "Otieno Ochieng",
        email: null,
        phoneNumber: "+254722113344",
        hasPassword: false,
      },
    });
  });
});