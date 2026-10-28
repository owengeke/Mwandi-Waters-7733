import { z } from "zod";
import { desc, eq, and, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { adminOnly } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import { TARIFF_PER_UNIT_KES, calcAmountDue, deriveInvoiceStatus } from "../lib/billing";
import { chargeClient } from "../lib/ledger";
import { isoDate } from "../lib/validators";
import { invoiceNumber, pending } from "../lib/identifiers";

/** YYYY-MM billing month, e.g. 2026-10. Cannot be in the future. */
export const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((m) => {
    const [y, mo] = m.split("-").map(Number);
    const inputDate = new Date(Date.UTC(y, mo - 1, 1));
    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return inputDate <= currentMonth;
  }, "Billing month cannot be in the future");

/** Units with at most 2 decimal places, 0 <= units <= 10000. */
const units = z
  .number()
  .min(0, "Units must be non-negative")
  .max(10_000, "Units cannot exceed 10,000")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Max 2 decimal places")
  .transform((v) => Math.round(v * 100) / 100);

/** First day of a YYYY-MM month in YYYY-MM-DD form. */
const monthStart = (m: string) => `${m}-01`;
/** Last day of a YYYY-MM month in YYYY-MM-DD form. */
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 0));
  return d.toISOString().slice(0, 10);
};

export const usage = {
  /** Tariff snapshot for the admin UI preview. */
  tariff: adminOnly.handler(() => ({ perUnitKes: TARIFF_PER_UNIT_KES, currency: "KES" as const })),

  /**
   * All clients with their most recent issued usage for a billing month.
   * Existing invoices are returned; clients without one are shown with null.
   */
  list: adminOnly
    .input(z.object({ month }))
    .handler(async ({ input }) => {
      const start = monthStart(input.month);
      const rows = await db
        .select({
          invoice: t.invoices,
          client: { id: t.clients.id, accountNumber: t.clients.accountNumber, fullName: t.clients.fullName, currentBalanceKes: t.clients.currentBalanceKes },
        })
        .from(t.invoices)
        .innerJoin(t.clients, eq(t.clients.id, t.invoices.clientId))
        .where(eq(t.invoices.billingPeriodStart, start))
        .orderBy(desc(t.invoices.createdAt));

      const clients = await db
        .select()
        .from(t.clients)
        .where(eq(t.clients.status, "ACTIVE"))
        .orderBy(t.clients.accountNumber);

      const byClient = new Map<number, (typeof rows)[number]>();
      for (const r of rows) byClient.set(r.client.id, r);

      return {
        month: input.month,
        periodStart: start,
        periodEnd: monthEnd(input.month),
        tariffPerUnitKes: TARIFF_PER_UNIT_KES,
        clients: clients.map((c) => {
          const hit = byClient.get(c.id);
          return {
            client: {
              id: c.id,
              accountNumber: c.accountNumber,
              fullName: c.fullName,
              currentBalanceKes: c.currentBalanceKes,
            },
            invoice: hit
              ? {
                  id: hit.invoice.id,
                  invoiceNumber: hit.invoice.invoiceNumber,
                  consumptionUnits: hit.invoice.consumptionUnits,
                  ratePerUnitKes: hit.invoice.ratePerUnitKes,
                  issuedBy: hit.invoice.issuedBy,
                  issuedAt: hit.invoice.issuedAt,
                  amountDueKes: hit.invoice.amountDueKes,
                  amountPaidKes: hit.invoice.amountPaidKes,
                  status: hit.invoice.status,
                  paid: Number(hit.invoice.amountPaidKes) >= Number(hit.invoice.amountDueKes),
                }
              : null,
          };
        }),
      };
    }),

  /**
   * Issue an invoice for a single client for a billing month.
   * One invoice per (client, billingPeriodStart); duplicate is rejected.
   * Amount is computed by the DB from units × ratePerUnitKes.
   */
  issue: adminOnly
    .input(
      z.object({
        clientId: z.number().int().positive(),
        month,
        consumptionUnits: units,
        dueDate: isoDate.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const start = monthStart(input.month);
      const end = monthEnd(input.month);
      const dueDate = input.dueDate ?? end;

      const [client] = await db.select().from(t.clients).where(eq(t.clients.id, input.clientId));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });
      if (client.status === "DISCONNECTED")
        throw new ORPCError("CONFLICT", { message: "Cannot bill a disconnected account" });

      // Duplicate guard.
      const [existing] = await db
        .select({ id: t.invoices.id })
        .from(t.invoices)
        .where(and(eq(t.invoices.clientId, input.clientId), eq(t.invoices.billingPeriodStart, start)));
      if (existing)
        throw new ORPCError("CONFLICT", { message: `Usage already issued for ${input.month} on ${client.fullName}` });

      const issuedBy = (context.user as { email?: string }).email ?? "admin";
      const issuedAt = new Date();

      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.invoices)
          .values({
            clientId: input.clientId,
            billingPeriodStart: start,
            billingPeriodEnd: end,
            consumptionUnits: input.consumptionUnits,
            ratePerUnitKes: TARIFF_PER_UNIT_KES,
            issuedBy,
            issuedAt,
            dueDate,
            invoiceNumber: pending(),
          })
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

  /**
   * Bulk issue usage for a month. All-or-nothing: if any row fails, none persist.
   */
  bulk: adminOnly
    .input(
      z.object({
        month,
        rows: z
          .array(
            z.object({
              clientId: z.number().int().positive(),
              consumptionUnits: units,
              dueDate: isoDate.optional(),
            }),
          )
          .min(1),
      }),
    )
    .handler(async ({ input, context }) => {
      const issuedBy = (context.user as { email?: string }).email ?? "admin";
      const issuedAt = new Date();
      const start = monthStart(input.month);
      const end = monthEnd(input.month);

      return db.transaction(async (tx) => {
        const out: unknown[] = [];
        for (const row of input.rows) {
          const [client] = await tx.select().from(t.clients).where(eq(t.clients.id, row.clientId));
          if (!client) throw new ORPCError("NOT_FOUND", { message: `Client ${row.clientId} not found` });
          if (client.status === "DISCONNECTED")
            throw new ORPCError("CONFLICT", { message: `Cannot bill disconnected account ${client.fullName}` });

          const [existing] = await tx
            .select({ id: t.invoices.id })
            .from(t.invoices)
            .where(and(eq(t.invoices.clientId, row.clientId), eq(t.invoices.billingPeriodStart, start)));
          if (existing)
            throw new ORPCError("CONFLICT", { message: `Usage already issued for ${input.month} on ${client.fullName}` });

          const dueDate = row.dueDate ?? end;
          const [r] = await tx
            .insert(t.invoices)
            .values({
              clientId: row.clientId,
              billingPeriodStart: start,
              billingPeriodEnd: end,
              consumptionUnits: row.consumptionUnits,
              ratePerUnitKes: TARIFF_PER_UNIT_KES,
              issuedBy,
              issuedAt,
              dueDate,
              invoiceNumber: pending(),
            })
            .returning();
          const [final] = await tx
            .update(t.invoices)
            .set({ invoiceNumber: invoiceNumber(r.id) })
            .where(eq(t.invoices.id, r.id))
            .returning();
          await chargeClient(tx, client.id, final.amountDueKes ?? calcAmountDue(row.consumptionUnits));
          out.push(final);
        }
        return { count: out.length, invoices: out };
      });
    }),

  /**
   * Correct an issued invoice's consumption units. Blocked if any payment exists.
   * The stored ratePerUnitKes is immutable — only units may change.
   */
  correct: adminOnly
    .input(
      z.object({
        id: z.number().int().positive(),
        consumptionUnits: units,
      }),
    )
    .handler(async ({ input }) => {
      const [inv] = await db.select().from(t.invoices).where(eq(t.invoices.id, input.id));
      if (!inv) throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });

      const [pay] = await db
        .select({ id: t.payments.id })
        .from(t.payments)
        .where(eq(t.payments.invoiceId, input.id));
      if (pay)
        throw new ORPCError("CONFLICT", { message: "Cannot correct an invoice with payments applied" });

      const oldAmount = Number(inv.amountDueKes);

      const [client] = await db.select().from(t.clients).where(eq(t.clients.id, inv.clientId));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(t.invoices)
          .set({
            consumptionUnits: input.consumptionUnits,
          })
          .where(eq(t.invoices.id, input.id))
          .returning();

        const newAmount = Number(updated.amountDueKes);
        const newPaid = Number(inv.amountPaidKes);
        await tx
          .update(t.invoices)
          .set({ status: deriveInvoiceStatus(newAmount, newPaid, inv.dueDate) })
          .where(eq(t.invoices.id, input.id));

        const delta = Math.round((newAmount - oldAmount) * 100) / 100;
        if (delta !== 0) {
          await tx
            .update(t.clients)
            .set({
              currentBalanceKes: sql`round(${t.clients.currentBalanceKes} + ${delta}, 2)`,
            })
            .where(eq(t.clients.id, client.id));
        }
        const [final] = await tx.select().from(t.invoices).where(eq(t.invoices.id, input.id));
        return final;
      });
    }),
};

