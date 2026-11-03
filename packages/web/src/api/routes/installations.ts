import { z } from "zod";
import { and, desc, eq, isNull, like, ne, or, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator } from "../middleware/auth";
import { db } from "../database";
import {
  auditLog,
  clients,
  installationRequests,
  meterReadings,
  onboardingTokens,
  INSTALLATION_STATUSES,
  type InstallationStatus,
} from "../database/schema";
import { createInstallationRequest } from "../lib/installations";
import { installationBlocker } from "../lib/installation-rules";
import { auditEntry } from "../lib/audit";
import { createClientLogin } from "../lib/client-login";
import { deliverWelcomeMessage } from "../lib/notify";
import { nextAccountNumber, nextAccountSql, nextMeterNumber, nextMeterSql } from "../lib/numbering";
import { openingReadingRow } from "../lib/meter-readings";
import { kenyanPhone, kes, idInput, pagination, readingValue } from "../lib/validators";
import { normalizeOccupancy } from "../lib/property";
import { todayISO } from "../lib/billing";

/** Allowed lifecycle transitions. */
const TRANSITIONS: Record<InstallationStatus, InstallationStatus[]> = {
  PENDING_REVIEW: ["APPROVED_PENDING_PAYMENT", "REJECTED"],
  APPROVED_PENDING_PAYMENT: ["PAID", "REJECTED"],
  PAID: ["INSTALLED"],
  INSTALLED: [],
  REJECTED: [],
};

const METER_PATTERN = /^MTR-\d{4,}$/;

async function getOrThrow(id: number) {
  const [row] = await db.select().from(installationRequests).where(eq(installationRequests.id, id));
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Installation request not found" });
  return row;
}

function assertTransition(from: InstallationStatus, to: InstallationStatus) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ORPCError("CONFLICT", { message: `Cannot move request from ${from} to ${to}` });
  }
}

export const installations = {
  list: operator
    .input(
      pagination.extend({
        status: z.enum(INSTALLATION_STATUSES).optional(),
        search: z.string().trim().optional(),
      }),
    )
    .handler(({ input }) => {
      const filters: SQL[] = [];
      if (input.status) filters.push(eq(installationRequests.status, input.status));
      if (input.search) {
        const q = `%${input.search}%`;
        filters.push(
          or(
            like(installationRequests.referenceNumber, q),
            like(installationRequests.fullName, q),
            like(installationRequests.phoneNumber, q),
          )!,
        );
      }
      return db
        .select()
        .from(installationRequests)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(installationRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  get: operator.input(idInput).handler(({ input }) => getOrThrow(input.id)),

  create: operator
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(120),
        phoneNumber: kenyanPhone,
        physicalAddress: z.string().trim().min(3).max(300),
      }),
    )
    .handler(({ input }) => createInstallationRequest(input)),

  /** Review approves the request and quotes the installation fee. */
  approve: operator
    .input(idInput.extend({ installationFeeKes: kes }))
    .handler(async ({ input, context }) => {
      const req = await getOrThrow(input.id);
      assertTransition(req.status, "APPROVED_PENDING_PAYMENT");
      const [row] = await db
        .update(installationRequests)
        .set({ status: "APPROVED_PENDING_PAYMENT", installationFeeKes: input.installationFeeKes })
        .where(eq(installationRequests.id, input.id))
        .returning();

      await db
        .insert(auditLog)
        .values(
          auditEntry({
            actorUserId: (context.user as { id?: string }).id,
            action: "application.approved",
            entityType: "installation_request",
            entityId: row.id,
            metadata: { referenceNumber: row.referenceNumber, installationFeeKes: input.installationFeeKes },
          }),
        )
        .catch((error) => console.error("[installations] could not write audit entry", error));

      return row;
    }),

  reject: operator
    .input(idInput.extend({ reason: z.string().trim().min(3).max(500) }))
    .handler(async ({ input }) => {
      const req = await getOrThrow(input.id);
      assertTransition(req.status, "REJECTED");
      const [row] = await db
        .update(installationRequests)
        .set({ status: "REJECTED", rejectionReason: input.reason })
        .where(eq(installationRequests.id, input.id))
        .returning();
      return row;
    }),

  markPaid: operator.input(idInput).handler(async ({ input }) => {
    const req = await getOrThrow(input.id);
    assertTransition(req.status, "PAID");
    const [row] = await db
      .update(installationRequests)
      .set({ status: "PAID" })
      .where(eq(installationRequests.id, input.id))
      .returning();
    return row;
  }),

  /**
   * Field team has fitted the meter. The client's details must be complete
   * first; the meter number and opening reading come from the technician and
   * are never taken from public input.
   */
  markInstalled: operator
    .input(
      idInput.extend({
        meterNumber: z
          .string()
          .trim()
          .toUpperCase()
          .regex(METER_PATTERN, "Meter numbers look like MTR-0001")
          .optional(),
        /** The first number on the newly fitted meter. */
        openingReading: readingValue.default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const req = await getOrThrow(input.id);
      assertTransition(req.status, "INSTALLED");

      const blocker = installationBlocker(req);
      if (blocker) throw new ORPCError("CONFLICT", { message: blocker });

      if (input.meterNumber) {
        const [taken] = await db
          .select({ accountNumber: clients.accountNumber })
          .from(clients)
          .where(eq(clients.meterNumber, input.meterNumber));
        if (taken) {
          throw new ORPCError("CONFLICT", {
            message: `Meter ${input.meterNumber} is already registered to ${taken.accountNumber}.`,
          });
        }
      }

      const result = await db.transaction(async (tx) => {
        const [accountRow] = await tx
          .select({ max: nextAccountSql })
          .from(clients)
          .where(ne(clients.status, "DRAFT"));

        let maxMeter = 0;
        if (!input.meterNumber) {
          const [meterRow] = await tx
            .select({ max: nextMeterSql })
            .from(clients)
            .where(like(clients.meterNumber, "MTR-%"));
          maxMeter = Number(meterRow?.max ?? 0);
        }

        // Defensive: legacy applications may predate the occupant rule.
        const occupancy = normalizeOccupancy({
          propertyType: req.propertyType,
          occupantType: req.occupantType,
          landlordPhone: req.landlordPhone,
        });

        const [client] = await tx
          .insert(clients)
          .values({
            accountNumber: nextAccountNumber(Number(accountRow?.max ?? 0)),
            meterNumber: input.meterNumber ?? nextMeterNumber(maxMeter),
            fullName: req.fullName,
            phoneNumber: req.phoneNumber,
            email: req.email,
            ...occupancy,
            estate: req.estate,
            plotOrHouseNo: req.plotOrHouseNo,
            landmark: req.landmark,
            createdVia: "online",
            status: "ACTIVE",
          })
          .returning();

        const [request] = await tx
          .update(installationRequests)
          .set({ status: "INSTALLED", clientId: client.id })
          .where(eq(installationRequests.id, req.id))
          .returning();

        await tx.insert(meterReadings).values(
          openingReadingRow({
            clientId: client.id,
            reading: input.openingReading,
            readingDate: todayISO(),
            recordedBy: (context.user as { email?: string }).email ?? null,
            meterNumber: client.meterNumber,
          }),
        );

        return { request, client, openingReading: input.openingReading };
      });

      // The login uses the hash saved in onboarding step 4 — never a password.
      try {
        await createClientLogin({
          name: result.client.fullName,
          email: result.client.email,
          phoneNumber: result.client.phoneNumber,
          clientId: result.client.id,
          accountNumber: result.client.accountNumber,
          passwordHash: req.passwordHash,
        });
      } catch (error) {
        // Roll the install back so the technician can retry cleanly.
        await db.transaction(async (tx) => {
          await tx
            .update(installationRequests)
            .set({ status: "PAID", clientId: null })
            .where(eq(installationRequests.id, req.id));
          await tx.delete(clients).where(eq(clients.id, result.client.id));
        });
        throw error;
      }

      await db
        .update(onboardingTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(onboardingTokens.applicationId, req.id), isNull(onboardingTokens.usedAt)));

      await db
        .insert(auditLog)
        .values(
          auditEntry({
            actorUserId: (context.user as { id?: string }).id,
            action: "installed",
            entityType: "installation_request",
            entityId: req.id,
            metadata: {
              clientId: result.client.id,
              accountNumber: result.client.accountNumber,
              meterNumber: result.client.meterNumber,
            },
          }),
        )
        .catch((error) => console.error("[installations] could not write audit entry", error));

      await deliverWelcomeMessage(
        result.client.phoneNumber,
        result.client.fullName.trim().split(/\s+/)[0] ?? "there",
        result.client.accountNumber,
      );

      return result;
    }),
};