import { z } from "zod";
import { desc, eq, and, lt, gte, asc, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { adminOnly, clientOnly } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import { TARIFF_PER_UNIT_KES, calcAmountDue, deriveInvoiceStatus, todayISO } from "../lib/billing";
import { chargeClient } from "../lib/ledger";
import { isoDate } from "../lib/validators";
import { invoiceNumber, pending } from "../lib/identifiers";
import { buildUsageHistory } from "../lib/usage-history";
import { notifyInvoiceIssued } from "../lib/notify-invoice";
import {
  USAGE_HALVES,
  type UsageHalf,
  type UsageWindow,
  windowFor,
  windowContaining,
  windowLabel,
} from "../lib/usage-period";

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

/** 1st–15th or 16th–end of month. Defaults to the first half for older callers. */
const half = z.enum(USAGE_HALVES).default("FIRST");

/** Units with at most 2 decimal places, 0 <= units <= 10000. */
const units = z
  .number()
  .min(0, "Units must be non-negative")
  .max(10_000, "Units cannot exceed 10,000")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Max 2 decimal places")
  .transform((v) => Math.round(v * 100) / 100);

/** The window being issued; refusal here keeps future readings out of the books. */
function resolveWindow(monthInput: string, halfInput: UsageHalf): UsageWindow {
  const window = windowFor(monthInput, halfInput);
  if (window.start > windowContaining(todayISO()).start) {
    throw new ORPCError("BAD_REQUEST", { message: `${windowLabel(window)} has not started yet` });
  }
  return window;
}

/** Most recent issued reading strictly before a window, per client. */
async function previousReadings(start: string) {
  const rows = await db
    .select({
      clientId: t.invoices.clientId,
      invoiceNumber: t.invoices.invoiceNumber,
      consumptionUnits: t.invoices.consumptionUnits,
      amountDueKes: t.invoices.amountDueKes,
      billingPeriodStart: t.invoices.billingPeriodStart,
      billingPeriodEnd: t.invoices.billingPeriodEnd,
      issuedAt: t.invoices.issuedAt,
      updatedAt: t.invoices.updatedAt,
    })
    .from(t.invoices)
    .where(lt(t.invoices.billingPeriodStart, start))
    .orderBy(desc(t.invoices.billingPeriodStart));

  const byClient = new Map<number, (typeof rows)[number]>();
  for (const row of rows) if (!byClient.has(row.clientId)) byClient.set(row.clientId, row);
  return byClient;
}

export const usage = {
  /** Tariff snapshot for the admin UI preview. */
  tariff: adminOnly.handler(() => ({ perUnitKes: TARIFF_PER_UNIT_KES, currency: "KES" as const })),

  /**
   * All active clients with the invoice issued for one 15-day window, plus the
   * reading before it so the admin can sanity-check the new units.
   */
  list: adminOnly
    .input(z.object({ month, half }))
    .handler(async ({ input }) => {
      // Listing a window that has not started is harmless (nobody has been
      // issued yet), so unlike issue/bulk this does not reject it.
      const window = windowFor(input.month, input.half);

      const rows = await db
        .select({
          invoice: t.invoices,
          client: {
            id: t.clients.id,
            accountNumber: t.clients.accountNumber,
            fullName: t.clients.fullName,
            currentBalanceKes: t.clients.currentBalanceKes,
          },
        })
        .from(t.invoices)
        .innerJoin(t.clients, eq(t.clients.id, t.invoices.clientId))
        .where(eq(t.invoices.billingPeriodStart, window.start))
        .orderBy(desc(t.invoices.createdAt));

      const clients = await db
        .select()
        .from(t.clients)
        .where(eq(t.clients.status, "ACTIVE"))
        .orderBy(t.clients.accountNumber);

      const previous = await previousReadings(window.start);

      const byClient = new Map<number, (typeof rows)[number]>();
      for (const r of rows) byClient.set(r.client.id, r);

      return {
        month: input.month,
        half: input.half,
        window: { start: window.start, end: window.end, label: windowLabel(window) },
        periodStart: window.start,
        periodEnd: window.end,
        tariffPerUnitKes: TARIFF_PER_UNIT_KES,
        clients: clients.map((c) => {
          const hit = byClient.get(c.id);
          const prev = previous.get(c.id);
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
            previous: prev
              ? {
                  invoiceNumber: prev.invoiceNumber,
                  units: Number(prev.consumptionUnits),
                  amountKes: Number(prev.amountDueKes ?? 0),
                  periodStart: prev.billingPeriodStart,
                  periodEnd: prev.billingPeriodEnd,
                  lastUpdatedAt: prev.issuedAt ?? prev.updatedAt,
                }
              : null,
          };
        }),
      };
    }),

  /**
   * Issue an invoice for a single client for one 15-day window.
   * One invoice per (client, billingPeriodStart); duplicate is rejected.
   * Amount is computed by the DB from units × ratePerUnitKes.
   */
  issue: adminOnly
    .input(
      z.object({
        clientId: z.number().int().positive(),
        month,
        half,
        consumptionUnits: units,
        dueDate: isoDate.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const window = resolveWindow(input.month, input.half);
      const dueDate = input.dueDate ?? window.end;

      const [client] = await db.select().from(t.clients).where(eq(t.clients.id, input.clientId));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });
      if (client.status === "DISCONNECTED")
        throw new ORPCError("CONFLICT", { message: "Cannot bill a disconnected account" });

      // Duplicate guard.
      const [existing] = await db
        .select({ id: t.invoices.id })
        .from(t.invoices)
        .where(and(eq(t.invoices.clientId, input.clientId), eq(t.invoices.billingPeriodStart, window.start)));
      if (existing)
        throw new ORPCError("CONFLICT", {
          message: `Usage already issued for ${windowLabel(window)} on ${client.fullName}`,
        });

      // A legacy monthly invoice (1st–month end) already covers the second
      // window of its month, so issuing that window would double-bill.
      const [covering] = await db
        .select({ invoiceNumber: t.invoices.invoiceNumber })
        .from(t.invoices)
        .where(
          and(
            eq(t.invoices.clientId, input.clientId),
            lt(t.invoices.billingPeriodStart, window.start),
            gte(t.invoices.billingPeriodEnd, window.end),
          ),
        );
      if (covering)
        throw new ORPCError("CONFLICT", {
          message: `${windowLabel(window)} is already covered by ${covering.invoiceNumber}`,
        });

      const [prev] = await db
        .select({ units: t.invoices.consumptionUnits })
        .from(t.invoices)
        .where(and(eq(t.invoices.clientId, input.clientId), lt(t.invoices.billingPeriodStart, window.start)))
        .orderBy(desc(t.invoices.billingPeriodStart))
        .limit(1);

      const issuedBy = (context.user as { email?: string }).email ?? "admin";
      const issuedAt = new Date();

      const final = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.invoices)
          .values({
            clientId: input.clientId,
            billingPeriodStart: window.start,
            billingPeriodEnd: window.end,
            consumptionUnits: input.consumptionUnits,
            ratePerUnitKes: TARIFF_PER_UNIT_KES,
            issuedBy,
            issuedAt,
            dueDate,
            invoiceNumber: pending(),
          })
          .returning();
        const [updated] = await tx
          .update(t.invoices)
          .set({ invoiceNumber: invoiceNumber(row.id) })
          .where(eq(t.invoices.id, row.id))
          .returning();
        await chargeClient(tx, client.id, updated.amountDueKes ?? calcAmountDue(input.consumptionUnits));
        return updated;
      });

      await notifyInvoiceIssued({
        client,
        invoice: final,
        periodLabel: windowLabel(window),
        previousUnits: prev ? Number(prev.units) : null,
      });

      return final;
    }),

  /**
   * Bulk issue usage for one 15-day window. All-or-nothing: if any row fails,
   * none persist. Notices go out only after the transaction commits.
   */
  bulk: adminOnly
    .input(
      z.object({
        month,
        half,
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
      const window = resolveWindow(input.month, input.half);
      const issuedBy = (context.user as { email?: string }).email ?? "admin";
      const issuedAt = new Date();

      const previous = await previousReadings(window.start);

      const issued = await db.transaction(async (tx) => {
        const out: Array<{
          invoice: typeof t.invoices.$inferSelect;
          client: typeof t.clients.$inferSelect;
          previousUnits: number | null;
        }> = [];

        for (const row of input.rows) {
          const [client] = await tx.select().from(t.clients).where(eq(t.clients.id, row.clientId));
          if (!client) throw new ORPCError("NOT_FOUND", { message: `Client ${row.clientId} not found` });
          if (client.status === "DISCONNECTED")
            throw new ORPCError("CONFLICT", { message: `Cannot bill disconnected account ${client.fullName}` });

          const [existing] = await tx
            .select({ id: t.invoices.id })
            .from(t.invoices)
            .where(and(eq(t.invoices.clientId, row.clientId), eq(t.invoices.billingPeriodStart, window.start)));
          if (existing)
            throw new ORPCError("CONFLICT", {
              message: `Usage already issued for ${windowLabel(window)} on ${client.fullName}`,
            });

          // Legacy monthly invoice covering this window (see `issue`).
          const [covering] = await tx
            .select({ invoiceNumber: t.invoices.invoiceNumber })
            .from(t.invoices)
            .where(
              and(
                eq(t.invoices.clientId, row.clientId),
                lt(t.invoices.billingPeriodStart, window.start),
                gte(t.invoices.billingPeriodEnd, window.end),
              ),
            );
          if (covering)
            throw new ORPCError("CONFLICT", {
              message: `${windowLabel(window)} is already covered by ${covering.invoiceNumber} on ${client.fullName}`,
            });

          const dueDate = row.dueDate ?? window.end;
          const [r] = await tx
            .insert(t.invoices)
            .values({
              clientId: row.clientId,
              billingPeriodStart: window.start,
              billingPeriodEnd: window.end,
              consumptionUnits: row.consumptionUnits,
              ratePerUnitKes: TARIFF_PER_UNIT_KES,
              issuedBy,
              issuedAt,
              dueDate,
              invoiceNumber: pending(),
            })
            .returning();
          const [updated] = await tx
            .update(t.invoices)
            .set({ invoiceNumber: invoiceNumber(r.id) })
            .where(eq(t.invoices.id, r.id))
            .returning();
          await chargeClient(tx, client.id, updated.amountDueKes ?? calcAmountDue(row.consumptionUnits));

          const prev = previous.get(row.clientId);
          out.push({ invoice: updated, client, previousUnits: prev ? Number(prev.consumptionUnits) : null });
        }
        return out;
      });

      for (const entry of issued) {
        await notifyInvoiceIssued({
          client: entry.client,
          invoice: entry.invoice,
          periodLabel: windowLabel(window),
          previousUnits: entry.previousUnits,
        });
      }

      return { count: issued.length, invoices: issued.map((entry) => entry.invoice) };
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

  /**
   * The signed-in client's own readings, newest first, with empty 15-day
   * windows shown as "No reading yet". Deliberately client-only: admins and
   * staff use `list` instead and can never pull another account's history here.
   */
  history: clientOnly
    .input(z.object({ maxPeriods: z.number().int().min(1).max(24).optional() }).optional())
    .handler(async ({ input, context }) => {
      const clientId = context.user.clientId;
      if (!clientId) throw new ORPCError("NOT_FOUND", { message: "No water account is linked to this login" });

      const [client] = await db
        .select({ id: t.clients.id, accountNumber: t.clients.accountNumber, meterNumber: t.clients.meterNumber })
        .from(t.clients)
        .where(eq(t.clients.id, clientId));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Account not found" });

      const rows = await db
        .select({
          clientId: t.invoices.clientId,
          billingPeriodStart: t.invoices.billingPeriodStart,
          billingPeriodEnd: t.invoices.billingPeriodEnd,
          consumptionUnits: t.invoices.consumptionUnits,
          amountDueKes: t.invoices.amountDueKes,
          invoiceNumber: t.invoices.invoiceNumber,
          status: t.invoices.status,
          issuedAt: t.invoices.issuedAt,
          createdAt: t.invoices.createdAt,
        })
        .from(t.invoices)
        .where(eq(t.invoices.clientId, clientId))
        .orderBy(asc(t.invoices.billingPeriodStart));

      return {
        client,
        tariffPerUnitKes: TARIFF_PER_UNIT_KES,
        ...buildUsageHistory(clientId, rows, {
          today: todayISO(),
          maxPeriods: input?.maxPeriods ?? 12,
        }),
      };
    }),
};
