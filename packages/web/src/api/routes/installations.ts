import { z } from "zod";
import { desc, eq, like, or, and, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator } from "../middleware/auth";
import { db } from "../database";
import { installationRequests, clients, INSTALLATION_STATUSES, type InstallationStatus } from "../database/schema";
import { accountNumber, meterNumber, pending } from "../lib/identifiers";
import { createInstallationRequest } from "../lib/installations";
import { kenyanPhone, kes, idInput, pagination } from "../lib/validators";

/** Allowed lifecycle transitions. */
const TRANSITIONS: Record<InstallationStatus, InstallationStatus[]> = {
  PENDING_REVIEW: ["APPROVED_PENDING_PAYMENT", "REJECTED"],
  APPROVED_PENDING_PAYMENT: ["PAID", "REJECTED"],
  PAID: ["INSTALLED"],
  INSTALLED: [],
  REJECTED: [],
};

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
    .handler(async ({ input }) => {
      const req = await getOrThrow(input.id);
      assertTransition(req.status, "APPROVED_PENDING_PAYMENT");
      const [row] = await db
        .update(installationRequests)
        .set({ status: "APPROVED_PENDING_PAYMENT", installationFeeKes: input.installationFeeKes })
        .where(eq(installationRequests.id, input.id))
        .returning();
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
   * Field team has fitted the meter: creates the Client (ACC-XXXX) and assigns
   * a meter (MTR-XXXX, or a supplied existing one) atomically.
   */
  markInstalled: operator
    .input(idInput.extend({ meterNumber: z.string().trim().toUpperCase().regex(/^MTR-\d{4,}$/).optional() }))
    .handler(async ({ input }) => {
      const req = await getOrThrow(input.id);
      assertTransition(req.status, "INSTALLED");
      return db.transaction(async (tx) => {
        const [client] = await tx
          .insert(clients)
          .values({
            accountNumber: pending(),
            meterNumber: input.meterNumber ?? pending(),
            fullName: req.fullName,
            phoneNumber: req.phoneNumber,
          })
          .returning();
        const [finalClient] = await tx
          .update(clients)
          .set({
            accountNumber: accountNumber(client.id),
            meterNumber: input.meterNumber ?? meterNumber(client.id),
          })
          .where(eq(clients.id, client.id))
          .returning();
        const [request] = await tx
          .update(installationRequests)
          .set({ status: "INSTALLED", clientId: finalClient.id })
          .where(eq(installationRequests.id, req.id))
          .returning();
        return { request, client: finalClient };
      });
    }),
};
