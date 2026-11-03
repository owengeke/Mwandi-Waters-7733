import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { operator } from "../middleware/auth";
import { auth } from "../auth";
import { db } from "../database";
import * as t from "../database/schema";
import { idInput } from "../lib/validators";
import { auditEntry } from "../lib/audit";
import { setClientPassword } from "../lib/client-login";
import {
  INVALID_ONBOARDING_LINK,
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
  type OnboardingStep,
} from "../lib/onboarding";
import { rateLimit, requestKey } from "../lib/rate-limit";
import { normalizeOccupancy } from "../lib/property";
import { deliverOnboardingLink } from "../lib/notify";
import { onboardingLink } from "../lib/app-url";

const invalidLink = () => new ORPCError("NOT_FOUND", { message: INVALID_ONBOARDING_LINK });
const tooMany = () =>
  new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests. Please wait a minute and try again." });

const tokenInput = z.object({ token: z.string().min(1).max(300) });

/** Looks up a raw token by its hash; missing, expired and used all look the same. */
async function resolveToken(raw: string) {
  const [row] = await db
    .select()
    .from(t.onboardingTokens)
    .where(eq(t.onboardingTokens.tokenHash, hashOnboardingToken(raw)));
  if (!row || !isOnboardingTokenUsable(row)) throw invalidLink();
  return row;
}

function parseStep<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ORPCError("BAD_REQUEST", {
      message: result.error.issues[0]?.message ?? "Check the details and try again.",
    });
  }
  return result.data;
}

function progressResponse(row: Parameters<typeof onboardingProgress>[0], step: OnboardingStep) {
  const progress = onboardingProgress(row);
  return {
    saved: true,
    step,
    currentStep: progress.currentStep,
    completedSteps: progress.completedSteps,
    completed: progress.completed,
  };
}

async function saveApplicationStep(applicationId: number, step: OnboardingStep, data: unknown) {
  const [req] = await db
    .select()
    .from(t.installationRequests)
    .where(eq(t.installationRequests.id, applicationId));
  if (!req) throw invalidLink();

  if (step === 1) {
    const parsed = parseStep(onboardingStep1, data);
    await db
      .update(t.installationRequests)
      .set({ fullName: parsed.fullName, email: parsed.email ?? null })
      .where(eq(t.installationRequests.id, req.id));
  } else if (step === 2) {
    const parsed = parseStep(onboardingStep2, data);
    // Residential is owner-occupied: drop any tenant choice / landlord phone a
    // client may still send, and default commercial to owner.
    const occupancy = normalizeOccupancy(parsed);
    await db
      .update(t.installationRequests)
      .set({
        propertyType: occupancy.propertyType,
        occupantType: occupancy.occupantType,
        estate: parsed.estate,
        plotOrHouseNo: parsed.plotOrHouseNo,
        landmark: parsed.landmark,
        landlordPhone: occupancy.landlordPhone,
      })
      .where(eq(t.installationRequests.id, req.id));
  } else if (step === 3) {
    parseStep(onboardingStep3, data);
    await db
      .update(t.installationRequests)
      .set({ whatsappConsentAt: new Date() })
      .where(eq(t.installationRequests.id, req.id));
  } else {
    const parsed = parseStep(onboardingStep4, data);
    if (!req.propertyType || !req.occupantType) {
      throw new ORPCError("BAD_REQUEST", { message: "Complete your property details first." });
    }
    if (!req.whatsappConsentAt) {
      throw new ORPCError("BAD_REQUEST", { message: "Please give your WhatsApp consent first." });
    }

    const passwordHash = await (await auth.$context).password.hash(parsed.password);
    const firstCompletion = req.detailsCompletedAt === null;
    await db
      .update(t.installationRequests)
      .set({ passwordHash, detailsCompletedAt: req.detailsCompletedAt ?? new Date() })
      .where(eq(t.installationRequests.id, req.id));

    if (firstCompletion) {
      await db
        .insert(t.auditLog)
        .values(
          auditEntry({
            action: "details.completed",
            entityType: "installation_request",
            entityId: req.id,
            metadata: { referenceNumber: req.referenceNumber },
          }),
        )
        .catch((error) => console.error("[onboarding] could not write audit entry", error));
    }
  }

  const [fresh] = await db
    .select()
    .from(t.installationRequests)
    .where(eq(t.installationRequests.id, req.id));
  if (!fresh) throw invalidLink();
  return progressResponse(fresh, step);
}

async function saveClientStep(token: { id: number; clientId: number | null }, step: OnboardingStep, data: unknown) {
  if (step !== 4) {
    throw new ORPCError("BAD_REQUEST", { message: "This link only sets your password." });
  }
  const parsed = parseStep(onboardingStep4, data);
  const [client] = await db.select().from(t.clients).where(eq(t.clients.id, token.clientId!));
  if (!client) throw invalidLink();

  const passwordHash = await (await auth.$context).password.hash(parsed.password);
  await setClientPassword(client.id, passwordHash);
  await db
    .update(t.onboardingTokens)
    .set({ usedAt: new Date() })
    .where(eq(t.onboardingTokens.id, token.id));
  await db
    .insert(t.auditLog)
    .values(
      auditEntry({
        action: "details.completed",
        entityType: "client",
        entityId: client.id,
        metadata: { accountNumber: client.accountNumber },
      }),
    )
    .catch((error) => console.error("[onboarding] could not write audit entry", error));

  return { saved: true, step: 4, currentStep: 4, completedSteps: [4], completed: true };
}

export const onboarding = {
  /**
   * Staff sends the "Complete your details" link once an application is paid.
   * Any previous unused link for the same application is revoked.
   */
  start: operator.input(idInput).handler(async ({ input }) => {
    const [req] = await db
      .select()
      .from(t.installationRequests)
      .where(eq(t.installationRequests.id, input.id));
    if (!req) throw new ORPCError("NOT_FOUND", { message: "Installation request not found" });
    if (req.status !== "PAID") {
      throw new ORPCError("CONFLICT", {
        message: "Only approved and paid applications can be sent a details link.",
      });
    }

    await db
      .update(t.onboardingTokens)
      .set({ usedAt: new Date() })
      .where(
        and(eq(t.onboardingTokens.applicationId, req.id), isNull(t.onboardingTokens.usedAt)),
      );

    const { token, tokenHash, expiresAt } = createOnboardingToken();
    await db.insert(t.onboardingTokens).values({ applicationId: req.id, tokenHash, expiresAt });

    const link = onboardingLink(token);
    const { channel } = await deliverOnboardingLink(req.phoneNumber, link);

    return {
      sent: channel !== "console",
      channel,
      expiresAt,
      ...(channel === "console" && process.env.NODE_ENV !== "production" ? { devLink: link } : {}),
    };
  }),

  /** Re-issues the set-password link for a walk-in client. */
  startClient: operator.input(idInput).handler(async ({ input }) => {
    const [client] = await db.select().from(t.clients).where(eq(t.clients.id, input.id));
    if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

    await db
      .update(t.onboardingTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(t.onboardingTokens.clientId, client.id), isNull(t.onboardingTokens.usedAt)));

    const { token, tokenHash, expiresAt } = createOnboardingToken();
    await db.insert(t.onboardingTokens).values({ clientId: client.id, tokenHash, expiresAt });

    const link = onboardingLink(token);
    const { channel } = await deliverOnboardingLink(client.phoneNumber, link);

    return {
      sent: channel !== "console",
      channel,
      expiresAt,
      ...(channel === "console" && process.env.NODE_ENV !== "production" ? { devLink: link } : {}),
    };
  }),

  /**
   * Public. Returns only this applicant's own saved fields. Missing, expired and
   * used tokens all produce the same generic error.
   */
  get: base.input(tokenInput).handler(async ({ input, context }) => {
    if (!rateLimit(requestKey(context.headers, "onboarding-get"), 60, 60_000)) throw tooMany();

    const token = await resolveToken(input.token);
    if (token.applicationId) {
      const [req] = await db
        .select()
        .from(t.installationRequests)
        .where(eq(t.installationRequests.id, token.applicationId));
      if (!req) throw invalidLink();
      return applicationOnboardingView(req);
    }
    if (token.clientId) {
      const [client] = await db.select().from(t.clients).where(eq(t.clients.id, token.clientId));
      if (!client) throw invalidLink();
      return clientSetPasswordView(client);
    }
    throw invalidLink();
  }),

  /** Public. Saves one step so the applicant can close the page and resume. */
  saveStep: base
    .input(
      z.object({
        token: z.string().min(10).max(300),
        step: z.number().int().min(1).max(4),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!rateLimit(requestKey(context.headers, "onboarding-save"), 60, 60_000)) throw tooMany();
      const tokenKey = `onboarding-token:${hashOnboardingToken(input.token).slice(0, 16)}`;
      if (!rateLimit(tokenKey, 30, 60_000)) throw tooMany();

      const token = await resolveToken(input.token);
      const step = input.step as OnboardingStep;
      if (token.applicationId) return saveApplicationStep(token.applicationId, step, input.data);
      if (token.clientId) return saveClientStep(token, step, input.data);
      throw invalidLink();
    }),
};