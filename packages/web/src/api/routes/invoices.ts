import { z } from "zod";
import { desc, eq, and, lt, inArray, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import { INVOICE_STATUSES } from "../database/schema";
import { invoiceNumber, pending } from "../lib/identifiers";
import { isoDate, idInput, pagination } from "../lib/validators";
import { TARIFF_PER_UNIT_KES, calcAmountDue, todayISO } from "../lib/billing";
import { chargeClient } from "../lib/ledger";

const units = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "Max 3 decimal places")
  .transform((v) => Math.round(v * 1000) / 1000);

export const invoices = {
  tariff: operator.handler(() => ({ perUnitKes: TARIFF_PER_UNIT_KES, currency: "KES" as const })),

  list: operator
    .input(
      pagination.extend({
        clientId: z.number().int().positive().optional(),
        status: z.enum(INVOICE_STATUSES).optional(),
      }),
    )
    .handler(({ input }) => {
      const filters: SQL[] = [];
      if (input.clientId) filters.push(eq(t.invoices.clientId, input.clientId));
      if (input.status) filters.push(eq(t.invoices.status, input.status));
      return db
        .select({
          invoice: t.invoices,
          client: { id: t.clients.id, accountNumber: t.clients.accountNumber, fullName: t.clients.fullName },
        })
        .from(t.invoices)
        .innerJoin(t.clients, eq(t.clients.id, t.invoices.clientId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(t.invoices.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  get: operator.input(idInput).handler(async ({ input }) => {
    const [row] = await db.select().from(t.invoices).where(eq(t.invoices.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
    return row;
  }),

  /** Issues an invoice using the shared tariff calculation. */
  create: operator
    .input(
      z
        .object({
          clientId: z.number().int().positive(),
          billingPeriodStart: isoDate,
          billingPeriodEnd: isoDate,
          consumptionUnits: units,
          dueDate: isoDate,
        })
        .refine((v) => v.billingPeriodEnd >= v.billingPeriodStart, {
          message: "Billing period end must be on/after start",
          path: ["billingPeriodEnd"],
        })
        .refine((v) => v.dueDate >= v.billingPeriodEnd, {
          message: "Due date must be on/after billing period end",
          path: ["dueDate"],
        }),
    )
    .handler(async ({ input }) => {
      const [client] = await db.select().from(t.clients).where(eq(t.clients.id, input.clientId));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });
      if (client.status === "DISCONNECTED") {
        throw new ORPCError("CONFLICT", { message: "Cannot bill a disconnected account" });
      }
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.invoices)
          .values({ ...input, amountDueKes: calcAmountDue(input.consumptionUnits), invoiceNumber: pending() })
          .returning();
        const [final] = await tx
          .update(t.invoices)
          .set({ invoiceNumber: invoiceNumber(row.id) })
          .where(eq(t.invoices.id, row.id))
          .returning();
        await chargeClient(tx, client.id, final.amountDueKes ?? calcAmountDue(input.consumptionUnits));
        return final;
      });
    }),

  /** Flags UNPAID / PARTIALLY_PAID invoices past their due date. Run daily (cron/scheduler). */
  markOverdue: operator.handler(async () => {
    const rows = await db
      .update(t.invoices)
      .set({ status: "OVERDUE" })
      .where(and(inArray(t.invoices.status, ["UNPAID", "PARTIALLY_PAID"]), lt(t.invoices.dueDate, todayISO())))
      .returning({ id: t.invoices.id });
    return { updated: rows.length };
  }),
};
