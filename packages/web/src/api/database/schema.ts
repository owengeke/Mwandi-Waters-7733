import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  numeric,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { TARIFF_PER_UNIT_KES } from "../lib/billing";

/**
 * Mwandi Waters — core schema.
 *
 * Money: all *_kes columns are NUMERIC (decimal affinity) in Kenyan Shillings,
 * read/written as JS numbers. Arithmetic in the API goes through lib/money.ts
 * (integer-cent math) so values are always rounded to 2 dp before storage.
 *
 * Tariff: flat KES 150 per consumption unit (m³). `invoices.amount_due_kes` is a
 * STORED generated column, so the database itself enforces
 *   amount_due_kes = round(consumption_units * rate_per_unit_kes, 2)
 * The fallback uses TARIFF_PER_UNIT_KES from lib/billing.ts — keep them in sync.
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
    /**
     * Tariff snapshot captured at issue time (KES per unit). Nullable with no DB
     * default: existing invoices keep NULL and the generated column falls back to
     * the legacy 150, so stored amounts never change. New invoices always set it
     * explicitly in code via the usage procedures.
     */
    ratePerUnitKes: numeric("rate_per_unit_kes", { mode: "number" }),
    issuedBy: text("issued_by"),
    issuedAt: integer("issued_at", { mode: "timestamp" }),
    amountDueKes: numeric("amount_due_kes", { mode: "number" }).generatedAlwaysAs(
      sql.raw(
        `CASE WHEN rate_per_unit_kes IS NULL
            THEN round(consumption_units * ${TARIFF_PER_UNIT_KES}, 2)
            ELSE round(consumption_units * rate_per_unit_kes, 2)
           END`,
      ),
      { mode: "stored" },
    ),
    amountPaidKes: numeric("amount_paid_kes", { mode: "number" }).notNull().default(0),
    dueDate: text("due_date").notNull(), // YYYY-MM-DD
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("UNPAID"),
    ...timestamps,
  },
  (t) => [
    index("invoices_client_idx").on(t.clientId),
    index("invoices_status_idx").on(t.status),
    index("invoices_due_date_idx").on(t.dueDate),
    uniqueIndex("invoices_client_period_idx").on(t.clientId, t.billingPeriodStart),
    check("invoices_status_chk", sql`${t.status} IN (${inList(INVOICE_STATUSES)})`),
    check("invoices_units_chk", sql`${t.consumptionUnits} >= 0`),
    check("invoices_rate_chk", sql`${t.ratePerUnitKes} IS NULL OR ${t.ratePerUnitKes} > 0`),
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

// ---------- M-Pesa STK transactions ----------
/**
 * One row per STK Push request. Persisted (never in memory) so the Vercel
 * callback can correlate a Safaricom response with the invoice that was paid.
 * `checkoutRequestId` is unique, and terminal statuses never change again —
 * that is what makes the callback idempotent.
 */
export const MPESA_TRANSACTION_STATUSES = ["PENDING", "SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT"] as const;
export type MpesaTransactionStatus = (typeof MPESA_TRANSACTION_STATUSES)[number];

export const mpesaTransactions = sqliteTable(
  "mpesa_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    checkoutRequestId: text("checkout_request_id").notNull().unique(),
    merchantRequestId: text("merchant_request_id"),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    phoneNumber: text("phone_number").notNull(),
    amountKes: numeric("amount_kes", { mode: "number" }).notNull(),
    status: text("status", { enum: MPESA_TRANSACTION_STATUSES }).notNull().default("PENDING"),
    resultCode: text("result_code"),
    resultDescription: text("result_description"),
    mpesaReceiptNumber: text("mpesa_receipt_number"),
    /** True when the payment was simulated because Daraja credentials are absent. */
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    rawCallback: text("raw_callback"),
    ...timestamps,
  },
  (t) => [
    index("mpesa_transactions_client_idx").on(t.clientId),
    index("mpesa_transactions_status_idx").on(t.status),
    check("mpesa_transactions_status_chk", sql`${t.status} IN (${inList(MPESA_TRANSACTION_STATUSES)})`),
    check("mpesa_transactions_amount_chk", sql`${t.amountKes} > 0`),
  ],
);

export type InstallationRequest = typeof installationRequests.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type MpesaTransaction = typeof mpesaTransactions.$inferSelect;

// Better Auth tables (user, session, account, verification) — generated, do not edit by hand.
export * from "./auth-schema";
