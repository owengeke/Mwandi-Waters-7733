import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  numeric,
  index,
  check,
} from "drizzle-orm/sqlite-core";

/**
 * Mwandi Waters — core schema.
 *
 * Money: all *_kes columns are NUMERIC (decimal affinity) in Kenyan Shillings,
 * read/written as JS numbers. Arithmetic in the API goes through lib/money.ts
 * (integer-cent math) so values are always rounded to 2 dp before storage.
 *
 * Tariff: flat KES 150 per consumption unit (m³). `invoices.amount_due_kes` is a
 * Amount due is stored after being calculated by the API using the shared
 * tariff helper. A regular column keeps SQLite schema synchronization safe.
 * Keep TARIFF_PER_UNIT_KES in lib/billing.ts in sync if this ever changes.
 */

// ---------- Enums ----------
export const INSTALLATION_STATUSES = [
  "PENDING_REVIEW",
  "APPROVED_PENDING_PAYMENT",
  "PAID",
  "INSTALLED",
  "REJECTED",
] as const;
export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];

export const CLIENT_STATUSES = ["ACTIVE", "SUSPENDED", "DISCONNECTED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const INVOICE_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_CHANNELS = ["MPESA_PAYBILL", "MPESA_STK_PUSH", "BANK_TRANSFER", "CASH"] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

// ---------- Installation requests ----------
export const installationRequests = sqliteTable(
  "installation_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referenceNumber: text("reference_number").notNull().unique(), // REQ-XXXX
    fullName: text("full_name").notNull(),
    phoneNumber: text("phone_number").notNull(), // E.164, +2547XXXXXXXX
    physicalAddress: text("physical_address").notNull(),
    status: text("status", { enum: INSTALLATION_STATUSES }).notNull().default("PENDING_REVIEW"),
    installationFeeKes: numeric("installation_fee_kes", { mode: "number" }).notNull().default(0),
    rejectionReason: text("rejection_reason"),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("installation_requests_status_idx").on(t.status),
    index("installation_requests_phone_idx").on(t.phoneNumber),
    check("installation_requests_status_chk", sql`${t.status} IN (${inList(INSTALLATION_STATUSES)})`),
    check("installation_requests_fee_chk", sql`${t.installationFeeKes} >= 0`),
  ],
);

// ---------- Clients ----------
export const clients = sqliteTable(
  "clients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountNumber: text("account_number").notNull().unique(), // ACC-XXXX
    fullName: text("full_name").notNull(),
    phoneNumber: text("phone_number").notNull(),
    meterNumber: text("meter_number").notNull().unique(), // MTR-XXXX
    /** Positive = client owes the utility; negative = credit on account. */
    currentBalanceKes: numeric("current_balance_kes", { mode: "number" }).notNull().default(0),
    status: text("status", { enum: CLIENT_STATUSES }).notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [
    index("clients_status_idx").on(t.status),
    index("clients_phone_idx").on(t.phoneNumber),
    check("clients_status_chk", sql`${t.status} IN (${inList(CLIENT_STATUSES)})`),
  ],
);

// ---------- Invoices ----------
export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull().unique(), // INV-XXXXX
    billingPeriodStart: text("billing_period_start").notNull(), // YYYY-MM-DD
    billingPeriodEnd: text("billing_period_end").notNull(), // YYYY-MM-DD
    consumptionUnits: numeric("consumption_units", { mode: "number" }).notNull(),
    amountDueKes: numeric("amount_due_kes", { mode: "number" }).notNull(),
    amountPaidKes: numeric("amount_paid_kes", { mode: "number" }).notNull().default(0),
    dueDate: text("due_date").notNull(), // YYYY-MM-DD
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("UNPAID"),
    ...timestamps,
  },
  (t) => [
    index("invoices_client_idx").on(t.clientId),
    index("invoices_status_idx").on(t.status),
    index("invoices_due_date_idx").on(t.dueDate),
    check("invoices_status_chk", sql`${t.status} IN (${inList(INVOICE_STATUSES)})`),
    check("invoices_units_chk", sql`${t.consumptionUnits} >= 0`),
    check("invoices_paid_chk", sql`${t.amountPaidKes} >= 0`),
    check("invoices_period_chk", sql`${t.billingPeriodEnd} >= ${t.billingPeriodStart}`),
  ],
);

// ---------- Payments ----------
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Nullable: a payment can land on the account without a specific invoice. */
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    /** M-Pesa receipt e.g. QX891234. Unique — prevents double-posting the same transaction. */
    mpesaReceiptNumber: text("mpesa_receipt_number").unique(),
    paymentChannel: text("payment_channel", { enum: PAYMENT_CHANNELS }).notNull(),
    amountPaidKes: numeric("amount_paid_kes", { mode: "number" }).notNull(),
    paymentDate: integer("payment_date", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("payments_client_idx").on(t.clientId),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_date_idx").on(t.paymentDate),
    check("payments_channel_chk", sql`${t.paymentChannel} IN (${inList(PAYMENT_CHANNELS)})`),
    check("payments_amount_chk", sql`${t.amountPaidKes} > 0`),
  ],
);

export type InstallationRequest = typeof installationRequests.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;

// Better Auth tables (user, session, account, verification) — generated, do not edit by hand.
export * from "./auth-schema";
