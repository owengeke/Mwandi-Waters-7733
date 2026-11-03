import { z } from "zod";
import { and, desc, eq, inArray, like, ne, or, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import {
  CLIENT_CREATED_VIA,
  CLIENT_STATUSES,
  OCCUPANT_TYPES,
  PROPERTY_TYPES,
} from "../database/schema";
import { accountNumber, pending } from "../lib/identifiers";
import { nextAccountNumber, nextAccountSql, nextMeterNumber, nextMeterSql } from "../lib/numbering";
import { kenyanPhone, idInput, optionalEmail, pagination, readingValue } from "../lib/validators";
import { normalizeOccupancy } from "../lib/property";
import { todayISO } from "../lib/billing";
import { openingReadingRow } from "../lib/meter-readings";
import { auditEntry } from "../lib/audit";
import { createClientLogin } from "../lib/client-login";
import { createOnboardingToken } from "../lib/onboarding";
import { deliverOnboardingLink } from "../lib/notify";
import { onboardingLink } from "../lib/app-url";

/** Applications that still block a second application/client for the same phone. */
const OPEN_APPLICATION_STATUSES = ["PENDING_REVIEW", "APPROVED_PENDING_PAYMENT", "PAID"] as const;

const METER_PATTERN = /^MTR-\d{4,}$/;

const draftInput = z.object({
  draftId: z.number().int().positive().optional(),
  fullName: z.string().trim().min(2, "Enter the client's full name").max(120),
  phoneNumber: kenyanPhone,
  email: optionalEmail,
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  occupantType: z.enum(OCCUPANT_TYPES).optional(),
  estate: z.string().trim().max(120).optional(),
  plotOrHouseNo: z.string().trim().max(60).optional(),
  landmark: z.string().trim().max(160).optional(),
  landlordPhone: kenyanPhone.optional(),
  meterNumber: z.string().trim().toUpperCase().regex(METER_PATTERN, "Meter numbers look like MTR-0001").optional(),
});

const createInput = z.object({
  fullName: z.string().trim().min(2, "Enter the client's full name").max(120),
  phoneNumber: kenyanPhone,
  email: optionalEmail,
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  occupantType: z.enum(OCCUPANT_TYPES).optional(),
  estate: z.string().trim().max(120).optional(),
  plotOrHouseNo: z.string().trim().max(60).optional(),
  landmark: z.string().trim().max(160).optional(),
  landlordPhone: kenyanPhone.optional(),
  meterNumber: z.string().trim().toUpperCase().regex(METER_PATTERN, "Meter numbers look like MTR-0001").optional(),
  /** First number on the newly fitted meter. Creates no invoice and no charge. */
  openingReading: readingValue.default(0),
  sendWhatsappLink: z.boolean().default(true),
  createdVia: z.enum(CLIENT_CREATED_VIA).default("walk_in"),
  /** When set, the saved draft is completed instead of inserting a second row. */
  draftId: z.number().int().positive().optional(),
});

type Duplicate = {
  client: { id: number; accountNumber: string } | null;
  application: { referenceNumber: string } | null;
};

async function findDuplicate(phoneNumber: string): Promise<Duplicate> {
  const [client] = await db
    .select({ id: t.clients.id, accountNumber: t.clients.accountNumber })
    .from(t.clients)
    .where(and(eq(t.clients.phoneNumber, phoneNumber), ne(t.clients.status, "DRAFT")));

  const [application] = await db
    .select({ referenceNumber: t.installationRequests.referenceNumber })
    .from(t.installationRequests)
    .where(
      and(
        eq(t.installationRequests.phoneNumber, phoneNumber),
        inArray(t.installationRequests.status, [...OPEN_APPLICATION_STATUSES]),
      ),
    );

  return { client: client ?? null, application: application ?? null };
}

/**
 * The next account/meter number is derived from the highest finalised number,
 * not from the row id, so saved drafts never leave gaps in the sequence.
 */
type WhatsAppResult =
  | { sent: boolean; channel: "whatsapp" | "sms" | "console"; expiresAt: Date; devLink?: string }
  | null;

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
      // Drafts live in the same table but only appear on the Drafts tab.
      else filters.push(ne(t.clients.status, "DRAFT"));
      if (input.search) {
        const q = `%${input.search}%`;
        filters.push(
          or(
            like(t.clients.accountNumber, q),
            like(t.clients.meterNumber, q),
            like(t.clients.fullName, q),
            like(t.clients.phoneNumber, q),
            like(t.clients.email, q),
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

  /** Client with their recent invoices and payments. */
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

  /** Read-only preview for the Add client panel. */
  previewAccountNumber: operator.handler(async () => {
    const [row] = await db
      .select({ max: nextAccountSql })
      .from(t.clients)
      .where(ne(t.clients.status, "DRAFT"));
    return { accountNumber: accountNumber(Number(row?.max ?? 0) + 1) };
  }),

  /** Called when the phone field loses focus, so the form can warn before saving. */
  checkDuplicate: operator.input(z.object({ phoneNumber: kenyanPhone })).handler(async ({ input }) => {
    const duplicate = await findDuplicate(input.phoneNumber);
    return {
      duplicate: Boolean(duplicate.client || duplicate.application),
      clientId: duplicate.client?.id ?? null,
      accountNumber: duplicate.client?.accountNumber ?? null,
      referenceNumber: duplicate.application?.referenceNumber ?? null,
    };
  }),

  saveDraft: operator.input(draftInput).handler(async ({ input, context }) => {
    const { draftId, meterNumber, landlordPhone, ...fields } = input;
    // Residential is owner-occupied; only commercial tenants keep a landlord.
    const occupancy = normalizeOccupancy({
      propertyType: fields.propertyType,
      occupantType: fields.occupantType,
      landlordPhone,
    });

    if (draftId) {
      const [existing] = await db
        .select()
        .from(t.clients)
        .where(and(eq(t.clients.id, draftId), eq(t.clients.status, "DRAFT")));
      if (!existing) throw new ORPCError("NOT_FOUND", { message: "Draft not found" });

      const [row] = await db
        .update(t.clients)
        .set({
          ...fields,
          ...occupancy,
          ...(meterNumber ? { meterNumber } : {}),
        })
        .where(eq(t.clients.id, draftId))
        .returning();

      await db.insert(t.auditLog).values(
        auditEntry({
          actorUserId: (context.user as { id?: string }).id,
          action: "client.edited",
          entityType: "client_draft",
          entityId: row.id,
          metadata: { draft: true },
        }),
      );
      return row;
    }

    const [maxAccount] = await db
      .select({ max: nextAccountSql })
      .from(t.clients)
      .where(ne(t.clients.status, "DRAFT"));

    const [row] = await db
      .insert(t.clients)
      .values({
        ...fields,
        ...occupancy,
        accountNumber: pending(),
        meterNumber: meterNumber ?? pending(),
        status: "DRAFT",
        createdVia: "walk_in",
      })
      .returning();

    await db.insert(t.auditLog).values(
      auditEntry({
        actorUserId: (context.user as { id?: string }).id,
        action: "client.created",
        entityType: "client_draft",
        entityId: row.id,
        metadata: { draft: true, nextAccountNumber: accountNumber(Number(maxAccount?.max ?? 0) + 1) },
      }),
    );

    return row;
  }),

  listDrafts: operator
    .input(pagination)
    .handler(({ input }) =>
      db
        .select()
        .from(t.clients)
        .where(eq(t.clients.status, "DRAFT"))
        .orderBy(desc(t.clients.updatedAt))
        .limit(input.limit)
        .offset(input.offset),
    ),

  /**
   * Creates the client, its single login, the opening meter-reading row and the
   * audit entry. The opening row never produces an invoice.
   */
  create: operator.input(createInput).handler(async ({ input, context }) => {
    const { openingReading, draftId, sendWhatsappLink, createdVia, landlordPhone, ...fields } = input;
    const phoneNumber = fields.phoneNumber;
    // Residential is owner-occupied; only commercial tenants keep a landlord.
    const occupancy = normalizeOccupancy({
      propertyType: fields.propertyType,
      occupantType: fields.occupantType,
      landlordPhone,
    });

    const duplicate = await findDuplicate(phoneNumber);
    if (duplicate.client) {
      throw new ORPCError("CONFLICT", {
        message: `A client with this phone already exists (${duplicate.client.accountNumber}).`,
        data: { accountNumber: duplicate.client.accountNumber, clientId: duplicate.client.id },
      });
    }
    if (duplicate.application) {
      throw new ORPCError("CONFLICT", {
        message: `An open application already exists for this phone (${duplicate.application.referenceNumber}).`,
        data: { referenceNumber: duplicate.application.referenceNumber },
      });
    }

    if (fields.meterNumber) {
      const [meterTaken] = await db
        .select({ accountNumber: t.clients.accountNumber, id: t.clients.id })
        .from(t.clients)
        .where(eq(t.clients.meterNumber, fields.meterNumber));
      if (meterTaken && meterTaken.id !== draftId) {
        throw new ORPCError("CONFLICT", {
          message: `Meter ${fields.meterNumber} is already registered to ${meterTaken.accountNumber}.`,
        });
      }
    }

    const row = await db.transaction(async (tx) => {
      const [accountRow] = await tx
        .select({ max: nextAccountSql })
        .from(t.clients)
        .where(ne(t.clients.status, "DRAFT"));

      let suppliedMeter = fields.meterNumber ?? null;
      let maxMeter = 0;
      if (!suppliedMeter) {
        const [meterRow] = await tx
          .select({ max: nextMeterSql })
          .from(t.clients)
          .where(like(t.clients.meterNumber, "MTR-%"));
        maxMeter = Number(meterRow?.max ?? 0);
      }
      const ids = {
        account: nextAccountNumber(Number(accountRow?.max ?? 0)),
        meter: suppliedMeter || nextMeterNumber(maxMeter),
      };

      const values = {
        ...fields,
        ...occupancy,
        meterNumber: ids.meter,
        accountNumber: ids.account,
        createdVia,
        status: "ACTIVE" as const,
      };

      let created;
      if (draftId) {
        const [draft] = await tx
          .select({ id: t.clients.id })
          .from(t.clients)
          .where(and(eq(t.clients.id, draftId), eq(t.clients.status, "DRAFT")));
        if (!draft) throw new ORPCError("NOT_FOUND", { message: "Draft not found" });
        [created] = await tx.update(t.clients).set(values).where(eq(t.clients.id, draftId)).returning();
      } else {
        [created] = await tx.insert(t.clients).values(values).returning();
      }

      await tx.insert(t.meterReadings).values(
        openingReadingRow({
          clientId: created.id,
          reading: openingReading,
          readingDate: todayISO(),
          recordedBy: (context.user as { email?: string }).email ?? null,
          meterNumber: created.meterNumber,
        }),
      );

      return created;
    });

    // The login is created outside the SQL transaction because Better Auth uses
    // its own adapter. If it fails, remove the just-created client so a retry is
    // not blocked by a half-created record.
    try {
      await createClientLogin({
        name: row.fullName,
        email: row.email,
        phoneNumber: row.phoneNumber,
        clientId: row.id,
        accountNumber: row.accountNumber,
      });
    } catch (error) {
      await db.delete(t.clients).where(eq(t.clients.id, row.id));
      throw error;
    }

    await db
      .insert(t.auditLog)
      .values(
        auditEntry({
          actorUserId: (context.user as { id?: string }).id,
          action: "client.created",
          entityType: "client",
          entityId: row.id,
          metadata: { accountNumber: row.accountNumber, meterNumber: row.meterNumber, createdVia },
        }),
      )
      .catch((error) => console.error("[clients] could not write audit entry", error));

    let whatsapp: WhatsAppResult = null;
    if (sendWhatsappLink) {
      const { token, tokenHash, expiresAt } = createOnboardingToken();
      await db.insert(t.onboardingTokens).values({ clientId: row.id, tokenHash, expiresAt });
      const link = onboardingLink(token);
      const { channel } = await deliverOnboardingLink(row.phoneNumber, link);
      whatsapp = {
        sent: channel !== "console",
        channel,
        expiresAt,
        ...(channel === "console" && process.env.NODE_ENV !== "production" ? { devLink: link } : {}),
      };
    }

    return { ...row, whatsapp };
  }),

  update: operator
    .input(
      idInput.extend({
        fullName: z.string().trim().min(2).max(120).optional(),
        phoneNumber: kenyanPhone.optional(),
        email: optionalEmail,
        propertyType: z.enum(PROPERTY_TYPES).optional(),
        occupantType: z.enum(OCCUPANT_TYPES).optional(),
        estate: z.string().trim().max(120).optional(),
        plotOrHouseNo: z.string().trim().max(60).optional(),
        landmark: z.string().trim().max(160).optional(),
        landlordPhone: kenyanPhone.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, landlordPhone, ...patch } = input;

      const [current] = await db
        .select({
          propertyType: t.clients.propertyType,
          occupantType: t.clients.occupantType,
          landlordPhone: t.clients.landlordPhone,
        })
        .from(t.clients)
        .where(eq(t.clients.id, id));
      if (!current) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

      // Keep the occupant/landlord rule even when only one of the pair is patched.
      const occupancy = normalizeOccupancy({
        propertyType: patch.propertyType ?? current.propertyType,
        occupantType: patch.occupantType ?? current.occupantType,
        landlordPhone: "landlordPhone" in input ? landlordPhone : current.landlordPhone,
      });

      if (patch.phoneNumber) {
        const [taken] = await db
          .select({ id: t.clients.id, accountNumber: t.clients.accountNumber })
          .from(t.clients)
          .where(
            and(
              eq(t.clients.phoneNumber, patch.phoneNumber),
              ne(t.clients.id, id),
              ne(t.clients.status, "DRAFT"),
            ),
          );
        if (taken) {
          throw new ORPCError("CONFLICT", {
            message: `Another client already uses this phone (${taken.accountNumber}).`,
            data: { accountNumber: taken.accountNumber, clientId: taken.id },
          });
        }

        const [login] = await db.select().from(t.user).where(eq(t.user.clientId, id));
        if (login) await db.update(t.user).set({ phoneNumber: patch.phoneNumber }).where(eq(t.user.id, login.id));
      }

      const [row] = await db
        .update(t.clients)
        .set({ ...patch, ...occupancy })
        .where(eq(t.clients.id, id))
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

      await db
        .insert(t.auditLog)
        .values(
          auditEntry({
            actorUserId: (context.user as { id?: string }).id,
            action: "client.edited",
            entityType: "client",
            entityId: row.id,
            metadata: { fields: Object.keys(patch) },
          }),
        )
        .catch((error) => console.error("[clients] could not write audit entry", error));

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