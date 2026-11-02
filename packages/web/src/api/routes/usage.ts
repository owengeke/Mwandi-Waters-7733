import { z } from "zod";
import { desc, eq, asc, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator, adminOnly, clientOnly } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import { TARIFF_PER_UNIT_KES, calcAmountDue, deriveInvoiceStatus, todayISO } from "../lib/billing";
import { chargeClient } from "../lib/ledger";
import { fromCents, toCents } from "../lib/money";
import { isoDate, readingValue } from "../lib/validators";
import { invoiceNumber, pending } from "../lib/identifiers";
import { notifyInvoiceIssued } from "../lib/notify-invoice";
import {
  addDaysISO,
  averageUnits,
  buildMeterHistory,
  checkReading,
  formatReading,
  formatReadingDate,
  isDuplicateReading,
  latestBilledReading,
  latestCorrectableReading,
  latestOpening,
  latestReading,
  roundReading,
  sortReadingsAscending,
  unitsBetween,
  INVOICE_DUE_DAYS,
} from "../lib/meter-readings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A reading date cannot be in the future; there is no cycle to fall inside. */
const readingDateInput = isoDate.refine((d) => d <= todayISO(), "Reading date cannot be in the future");

const METER_PATTERN = /^MTR-\d{4,}$/;

/** The fields the admin table and client dashboard need from a reading. */
function toReadingSummary(r: t.MeterReading) {
  return {
    id: r.id,
    readingValue: roundReading(r.readingValue),
    previousReading: roundReading(r.previousReading),
    unitsConsumed: roundReading(r.unitsConsumed),
    readingDate: r.readingDate,
    isOpening: r.isOpening,
    meterNumber: r.meterNumber,
  };
}

function toInvoiceSummary(invoice: t.Invoice) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    consumptionUnits: Number(invoice.consumptionUnits),
    amountDueKes: Number(invoice.amountDueKes ?? calcAmountDue(Number(invoice.consumptionUnits))),
    amountPaidKes: Number(invoice.amountPaidKes),
    dueDate: invoice.dueDate,
  };
}

async function notifyReading(
  client: { fullName: string; phoneNumber: string },
  invoice: t.Invoice,
  reading: t.MeterReading,
) {
  await notifyInvoiceIssued({
    client,
    invoice,
    readingDate: reading.readingDate,
    previousReading: reading.isOpening ? null : Number(reading.previousReading),
    currentReading: Number(reading.readingValue),
  });
}

interface RecordReadingArgs {
  clientId: number;
  currentReading: number;
  readingDate: string;
  recordedBy: string;
  confirmHighUsage: boolean;
}

/**
 * The single reading → invoice → balance path. Runs inside a caller-supplied
 * transaction so a single save and a bulk save behave identically. The invoice
 * insert is what the partial unique index on (client, date, value) protects:
 * a repeated submit rolls the whole thing back instead of double-billing.
 */
async function recordReadingTx(tx: Tx, args: RecordReadingArgs) {
  const [client] = await tx.select().from(t.clients).where(eq(t.clients.id, args.clientId));
  if (!client) throw new ORPCError("NOT_FOUND", { message: `Client ${args.clientId} not found` });
  if (client.status === "DISCONNECTED") {
    throw new ORPCError("CONFLICT", { message: `Cannot bill disconnected account ${client.fullName}` });
  }

  const readings = await tx.select().from(t.meterReadings).where(eq(t.meterReadings.clientId, client.id));
  const previous = latestReading(readings);
  if (!previous) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Set an opening meter reading for ${client.fullName} before recording usage.`,
    });
  }

  if (isDuplicateReading(readings, args.currentReading, args.readingDate)) {
    throw new ORPCError("CONFLICT", {
      message: `The reading ${formatReading(args.currentReading)} on ${formatReadingDate(args.readingDate)} has already been recorded for ${client.fullName}.`,
    });
  }

  const check = checkReading({
    currentReading: args.currentReading,
    readingDate: args.readingDate,
    previous,
    averageUnits: averageUnits(readings),
  });
  if (check.error) throw new ORPCError("BAD_REQUEST", { message: check.error });
  if (check.requiresConfirmation && !args.confirmHighUsage) {
    throw new ORPCError("CONFLICT", {
      message: `${check.warning} Confirm this reading to issue the bill.`,
    });
  }

  const units = check.units;
  const issuedAt = new Date();
  const dueDate = addDaysISO(args.readingDate, INVOICE_DUE_DAYS);

  const [draft] = await tx
    .insert(t.invoices)
    .values({
      clientId: client.id,
      billingPeriodStart: args.readingDate,
      billingPeriodEnd: args.readingDate,
      consumptionUnits: units,
      ratePerUnitKes: TARIFF_PER_UNIT_KES,
      issuedBy: args.recordedBy,
      issuedAt,
      dueDate,
      invoiceNumber: pending(),
    })
    .returning();
  const [invoice] = await tx
    .update(t.invoices)
    .set({ invoiceNumber: invoiceNumber(draft.id) })
    .where(eq(t.invoices.id, draft.id))
    .returning();

  const [reading] = await tx
    .insert(t.meterReadings)
    .values({
      clientId: client.id,
      readingValue: roundReading(args.currentReading),
      previousReading: roundReading(previous.readingValue),
      unitsConsumed: units,
      readingDate: args.readingDate,
      recordedBy: args.recordedBy,
      invoiceId: invoice.id,
      isOpening: false,
      meterNumber: client.meterNumber,
    })
    .returning();

  await chargeClient(tx, client.id, invoice.amountDueKes ?? calcAmountDue(units));

  return { client, invoice, reading, previous };
}

export const usage = {
  /** Tariff snapshot for the admin UI preview. */
  tariff: operator.handler(() => ({ perUnitKes: TARIFF_PER_UNIT_KES, currency: "KES" as const })),

  /**
   * Every active client with their latest meter reading, so the admin can type
   * the next number whenever they visit. There is no window or month filter.
   */
  list: operator.handler(async () => {
    const clients = await db
      .select()
      .from(t.clients)
      .where(eq(t.clients.status, "ACTIVE"))
      .orderBy(t.clients.accountNumber);

    const clientIds = clients.map((c) => c.id);
    const readings = clientIds.length
      ? await db
          .select()
          .from(t.meterReadings)
          .where(inArray(t.meterReadings.clientId, clientIds))
          .orderBy(asc(t.meterReadings.readingDate), asc(t.meterReadings.id))
      : [];

    const invoiceIds = [
      ...new Set(readings.map((r) => r.invoiceId).filter((v): v is number => v !== null)),
    ];
    const invoiceRows = invoiceIds.length
      ? await db.select().from(t.invoices).where(inArray(t.invoices.id, invoiceIds))
      : [];
    const invoiceById = new Map(invoiceRows.map((i) => [i.id, i]));

    const readingsByClient = new Map<number, t.MeterReading[]>();
    for (const reading of readings) {
      const list = readingsByClient.get(reading.clientId) ?? [];
      list.push(reading);
      readingsByClient.set(reading.clientId, list);
    }

    return {
      tariffPerUnitKes: TARIFF_PER_UNIT_KES,
      clients: clients.map((client) => {
        const rows = readingsByClient.get(client.id) ?? [];
        const lastReading = latestReading(rows);
        const billed = latestBilledReading(rows);
        const opening = latestOpening(rows);
        const latestInvoice = billed?.invoiceId != null ? invoiceById.get(billed.invoiceId) ?? null : null;

        return {
          client: {
            id: client.id,
            accountNumber: client.accountNumber,
            fullName: client.fullName,
            meterNumber: client.meterNumber,
            phoneNumber: client.phoneNumber,
            currentBalanceKes: Number(client.currentBalanceKes),
            status: client.status,
          },
          lastReading: lastReading ? toReadingSummary(lastReading) : null,
          latestBilled: billed
            ? { reading: toReadingSummary(billed), invoice: latestInvoice ? toInvoiceSummary(latestInvoice) : null }
            : null,
          opening: opening ? toReadingSummary(opening) : null,
          averageUnits: averageUnits(rows),
          readingCount: rows.filter((r) => !r.isOpening).length,
          canSetOpening: !rows.some((r) => !r.isOpening),
          canCorrect:
            latestCorrectableReading(rows) !== null &&
            latestInvoice !== null &&
            Number(latestInvoice.amountPaidKes) === 0,
        };
      }),
    };
  }),

  /**
   * Record one physical meter reading. The server looks up the previous
   * reading, derives the units, issues the invoice and updates the balance in
   * one transaction.
   */
  record: operator
    .input(
      z.object({
        clientId: z.number().int().positive(),
        currentReading: readingValue,
        readingDate: readingDateInput,
        confirmHighUsage: z.boolean().default(false),
      }),
    )
    .handler(async ({ input, context }) => {
      const recordedBy = (context.user as { email?: string }).email ?? "admin";
      const result = await db.transaction((tx) =>
        recordReadingTx(tx, {
          clientId: input.clientId,
          currentReading: input.currentReading,
          readingDate: input.readingDate,
          recordedBy,
          confirmHighUsage: input.confirmHighUsage,
        }),
      );
      await notifyReading(result.client, result.invoice, result.reading);
      return { reading: result.reading, invoice: result.invoice };
    }),

  /**
   * "Issue all pending": every row the admin filled in. All-or-nothing, so a
   * single bad reading leaves the books untouched.
   */
  recordMany: operator
    .input(
      z.object({
        readingDate: readingDateInput,
        rows: z
          .array(
            z.object({
              clientId: z.number().int().positive(),
              currentReading: readingValue,
              confirmHighUsage: z.boolean().default(false),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .handler(async ({ input, context }) => {
      const recordedBy = (context.user as { email?: string }).email ?? "admin";
      const seen = new Set<number>();
      for (const row of input.rows) {
        if (seen.has(row.clientId)) {
          throw new ORPCError("BAD_REQUEST", { message: "Each client can only appear once in a batch" });
        }
        seen.add(row.clientId);
      }

      const results = await db.transaction(async (tx) => {
        const out: Awaited<ReturnType<typeof recordReadingTx>>[] = [];
        for (const row of input.rows) {
          out.push(
            await recordReadingTx(tx, {
              clientId: row.clientId,
              currentReading: row.currentReading,
              readingDate: input.readingDate,
              recordedBy,
              confirmHighUsage: row.confirmHighUsage,
            }),
          );
        }
        return out;
      });

      for (const result of results) {
        await notifyReading(result.client, result.invoice, result.reading);
      }

      return {
        count: results.length,
        readings: results.map((r) => r.reading),
        invoices: results.map((r) => r.invoice),
      };
    }),

  /** Set (or change) the opening reading. Admin only, and locked once billed. */
  setOpening: adminOnly
    .input(
      z.object({
        clientId: z.number().int().positive(),
        openingReading: readingValue,
        readingDate: readingDateInput.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const recordedBy = (context.user as { email?: string }).email ?? "admin";
      return db.transaction(async (tx) => {
        const [client] = await tx.select().from(t.clients).where(eq(t.clients.id, input.clientId));
        if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

        const rows = await tx.select().from(t.meterReadings).where(eq(t.meterReadings.clientId, client.id));
        if (rows.some((r) => !r.isOpening)) {
          throw new ORPCError("CONFLICT", {
            message: "The opening reading is locked once a bill has been issued.",
          });
        }

        const readingDate = input.readingDate ?? todayISO();
        const existing = latestOpening(rows);
        if (existing) {
          const [updated] = await tx
            .update(t.meterReadings)
            .set({
              readingValue: input.openingReading,
              previousReading: input.openingReading,
              unitsConsumed: 0,
              readingDate,
              recordedBy,
              meterNumber: client.meterNumber,
            })
            .where(eq(t.meterReadings.id, existing.id))
            .returning();
          return updated;
        }

        const [created] = await tx
          .insert(t.meterReadings)
          .values({
            clientId: client.id,
            readingValue: input.openingReading,
            previousReading: input.openingReading,
            unitsConsumed: 0,
            readingDate,
            recordedBy,
            invoiceId: null,
            isOpening: true,
            meterNumber: client.meterNumber,
          })
          .returning();
        return created;
      });
    }),

  /**
   * Meter replaced or reset: assign the new meter and start a fresh chain from
   * its opening reading. Older readings stay, so history is never rewritten.
   */
  replaceMeter: adminOnly
    .input(
      z.object({
        clientId: z.number().int().positive(),
        meterNumber: z.string().trim().toUpperCase().regex(METER_PATTERN, "Meter numbers look like MTR-0001"),
        openingReading: readingValue,
        readingDate: readingDateInput.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const recordedBy = (context.user as { email?: string }).email ?? "admin";
      return db.transaction(async (tx) => {
        const [client] = await tx.select().from(t.clients).where(eq(t.clients.id, input.clientId));
        if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

        const [clash] = await tx
          .select({ id: t.clients.id })
          .from(t.clients)
          .where(eq(t.clients.meterNumber, input.meterNumber));
        if (clash && clash.id !== client.id) {
          throw new ORPCError("CONFLICT", { message: `Meter ${input.meterNumber} is already assigned to another client.` });
        }

        const rows = await tx.select().from(t.meterReadings).where(eq(t.meterReadings.clientId, client.id));
        const last = latestReading(rows);
        const readingDate = input.readingDate ?? todayISO();
        if (last && readingDate < last.readingDate) {
          throw new ORPCError("CONFLICT", {
            message: `Replacement date cannot be earlier than the last reading on ${formatReadingDate(last.readingDate)}.`,
          });
        }

        const [updatedClient] = await tx
          .update(t.clients)
          .set({ meterNumber: input.meterNumber })
          .where(eq(t.clients.id, client.id))
          .returning();

        const [reading] = await tx
          .insert(t.meterReadings)
          .values({
            clientId: client.id,
            readingValue: input.openingReading,
            previousReading: input.openingReading,
            unitsConsumed: 0,
            readingDate,
            recordedBy,
            invoiceId: null,
            isOpening: true,
            meterNumber: input.meterNumber,
          })
          .returning();

        return { client: updatedClient, reading };
      });
    }),

  /**
   * Correct the newest reading only. Recomputes its units, invoice amount and
   * the client balance; blocked when the invoice already has payments. The next
   * reading automatically follows the corrected value because it is read back
   * from the database.
   */
  correct: operator
    .input(
      z.object({
        id: z.number().int().positive(),
        readingValue,
      }),
    )
    .handler(async ({ input, context }) => {
      const correctedBy = (context.user as { email?: string }).email ?? "admin";
      return db.transaction(async (tx) => {
        const [reading] = await tx.select().from(t.meterReadings).where(eq(t.meterReadings.id, input.id));
        if (!reading) throw new ORPCError("NOT_FOUND", { message: "Reading not found" });
        if (reading.isOpening) {
          throw new ORPCError("BAD_REQUEST", { message: "The opening reading cannot be corrected here." });
        }

        const rows = await tx.select().from(t.meterReadings).where(eq(t.meterReadings.clientId, reading.clientId));
        const latest = latestReading(rows);
        if (!latest || latest.id !== reading.id) {
          throw new ORPCError("CONFLICT", { message: "Only the most recent reading can be corrected." });
        }
        if (reading.invoiceId === null) {
          throw new ORPCError("CONFLICT", { message: "This reading has no invoice to correct." });
        }

        const [invoice] = await tx.select().from(t.invoices).where(eq(t.invoices.id, reading.invoiceId));
        if (!invoice) throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
        if (Number(invoice.amountPaidKes) > 0) {
          throw new ORPCError("CONFLICT", { message: "Cannot correct a reading whose invoice has payments." });
        }

        const previousValue = roundReading(reading.previousReading);
        const newValue = roundReading(input.readingValue);
        if (newValue < previousValue) {
          const ascending = sortReadingsAscending(rows);
          const index = ascending.findIndex((r) => r.id === reading.id);
          const preceding = index > 0 ? ascending[index - 1] : null;
          throw new ORPCError("BAD_REQUEST", {
            message:
              `Reading must be at least ${formatReading(previousValue)}. ` +
              `The last reading was ${formatReading(previousValue)} on ${formatReadingDate(preceding?.readingDate ?? reading.readingDate)}.`,
          });
        }
        const units = unitsBetween(previousValue, newValue);
        const oldAmount = Number(invoice.amountDueKes ?? 0);

        const [billed] = await tx
          .update(t.invoices)
          .set({ consumptionUnits: units })
          .where(eq(t.invoices.id, invoice.id))
          .returning();
        const newAmount = Number(billed.amountDueKes ?? 0);
        const [finalInvoice] = await tx
          .update(t.invoices)
          .set({ status: deriveInvoiceStatus(newAmount, Number(billed.amountPaidKes), billed.dueDate) })
          .where(eq(t.invoices.id, invoice.id))
          .returning();

        const [updatedReading] = await tx
          .update(t.meterReadings)
          .set({ readingValue: newValue, unitsConsumed: units, correctedBy, correctedAt: new Date() })
          .where(eq(t.meterReadings.id, reading.id))
          .returning();

        const delta = fromCents(toCents(newAmount) - toCents(oldAmount));
        if (delta !== 0) {
          await tx
            .update(t.clients)
            .set({ currentBalanceKes: sql`round(${t.clients.currentBalanceKes} + ${delta}, 2)` })
            .where(eq(t.clients.id, reading.clientId));
        }

        return { reading: updatedReading, invoice: finalInvoice };
      });
    }),

  /**
   * The signed-in client's own meter readings, newest first, opening included.
   * Deliberately client-only: admins and staff use `list` instead and can never
   * pull another account's history here.
   */
  history: clientOnly
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .handler(async ({ input, context }) => {
      const clientId = context.user.clientId;
      if (!clientId) throw new ORPCError("NOT_FOUND", { message: "No water account is linked to this login" });

      const [client] = await db
        .select({
          id: t.clients.id,
          fullName: t.clients.fullName,
          accountNumber: t.clients.accountNumber,
          meterNumber: t.clients.meterNumber,
        })
        .from(t.clients)
        .where(eq(t.clients.id, clientId));
      if (!client) throw new ORPCError("NOT_FOUND", { message: "Account not found" });

      const rows = await db
        .select()
        .from(t.meterReadings)
        .where(eq(t.meterReadings.clientId, clientId))
        .orderBy(desc(t.meterReadings.readingDate), desc(t.meterReadings.id))
        .limit(input?.limit ?? 100);

      const invoiceIds = [
        ...new Set(rows.map((r) => r.invoiceId).filter((v): v is number => v !== null)),
      ];
      const invoiceRows = invoiceIds.length
        ? await db.select().from(t.invoices).where(inArray(t.invoices.id, invoiceIds))
        : [];
      const invoiceById = new Map(invoiceRows.map((i) => [i.id, i]));

      const source = rows.map((r) => {
        const invoice = r.invoiceId != null ? invoiceById.get(r.invoiceId) ?? null : null;
        const units = Number(r.unitsConsumed);
        return {
          ...r,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          invoiceStatus: invoice?.status ?? null,
          amountKes: r.isOpening ? 0 : Number(invoice?.amountDueKes ?? calcAmountDue(units)),
        };
      });

      return {
        client,
        tariffPerUnitKes: TARIFF_PER_UNIT_KES,
        ...buildMeterHistory(clientId, source),
      };
    }),
};
