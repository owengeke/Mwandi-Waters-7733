import { z } from "zod";
import { desc, eq, like, or, and, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import { CLIENT_STATUSES } from "../database/schema";
import { accountNumber, meterNumber, pending } from "../lib/identifiers";
import { kenyanPhone, idInput, pagination } from "../lib/validators";

export const clients = {
  list: operator
    .input(
      pagination.extend({
        status: z.enum(CLIENT_STATUSES).optional(),
        search: z.string().trim().optional(),
      }),
    )
    .handler(({ input }) => {
      const filters: SQL[] = [];
      if (input.status) filters.push(eq(t.clients.status, input.status));
      if (input.search) {
        const q = `%${input.search}%`;
        filters.push(
          or(
            like(t.clients.accountNumber, q),
            like(t.clients.meterNumber, q),
            like(t.clients.fullName, q),
            like(t.clients.phoneNumber, q),
          )!,
        );
      }
      return db
        .select()
        .from(t.clients)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(t.clients.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /** Client with their recent invoices and t.payments. */
  get: operator.input(idInput).handler(async ({ input }) => {
    const [client] = await db.select().from(t.clients).where(eq(t.clients.id, input.id));
    if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });
    const [clientInvoices, clientPayments] = await Promise.all([
      db.select().from(t.invoices).where(eq(t.invoices.clientId, input.id)).orderBy(desc(t.invoices.billingPeriodEnd)).limit(24),
      db.select().from(t.payments).where(eq(t.payments.clientId, input.id)).orderBy(desc(t.payments.paymentDate)).limit(24),
    ]);
    return { ...client, invoices: clientInvoices, payments: clientPayments };
  }),

  getByAccount: operator
    .input(z.object({ accountNumber: z.string().trim().toUpperCase() }))
    .handler(async ({ input }) => {
      const [client] = await db.select().from(t.clients).where(eq(t.clients.accountNumber, input.accountNumber));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Account not found" });
      return client;
    }),

  /** Direct onboarding (e.g. migrating legacy accounts). Normal flow is installations.markInstalled. */
  create: operator
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(120),
        phoneNumber: kenyanPhone,
        meterNumber: z.string().trim().toUpperCase().regex(/^MTR-\d{4,}$/).optional(),
      }),
    )
    .handler(({ input }) =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.clients)
          .values({ ...input, accountNumber: pending(), meterNumber: input.meterNumber ?? pending() })
          .returning();
        const [final] = await tx
          .update(t.clients)
          .set({ accountNumber: accountNumber(row.id), meterNumber: input.meterNumber ?? meterNumber(row.id) })
          .where(eq(t.clients.id, row.id))
          .returning();
        return final;
      }),
    ),

  update: operator
    .input(
      idInput.extend({
        fullName: z.string().trim().min(2).max(120).optional(),
        phoneNumber: kenyanPhone.optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...patch } = input;
      const [row] = await db.update(t.clients).set(patch).where(eq(t.clients.id, id)).returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Client not found" });
      return row;
    }),

  setStatus: operator
    .input(idInput.extend({ status: z.enum(CLIENT_STATUSES) }))
    .handler(async ({ input }) => {
      const [row] = await db.update(t.clients).set({ status: input.status }).where(eq(t.clients.id, input.id)).returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Client not found" });
      return row;
    }),
};
