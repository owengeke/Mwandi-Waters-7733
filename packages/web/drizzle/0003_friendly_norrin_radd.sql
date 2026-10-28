/*
 * WARNING: This migration MUST run as separate autocommit statements.
 * NEVER wrap in BEGIN...COMMIT.
 * NEVER run via drizzle-kit migrate or any db:migrate script.
 *
 * Reason: DROP TABLE invoices fires ON DELETE SET NULL on payments.invoice_id
 * inside a transaction, nulling all payment links. PRAGMA foreign_keys=OFF
 * only works per-statement outside a transaction.
 *
 * Execute each statement (split by --> statement-breakpoint) individually
 * in a single shell session so PRAGMA foreign_keys=OFF remains effective.
 */
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`billing_period_start` text NOT NULL,
	`billing_period_end` text NOT NULL,
	`consumption_units` numeric NOT NULL,
	`rate_per_unit_kes` numeric,
	`issued_by` text,
	`issued_at` integer,
	`amount_due_kes` numeric GENERATED ALWAYS AS (CASE WHEN rate_per_unit_kes IS NULL
            THEN round(consumption_units * 150, 2)
            ELSE round(consumption_units * rate_per_unit_kes, 2)
           END) STORED,
	`amount_paid_kes` numeric DEFAULT 0 NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'UNPAID' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoices_status_chk" CHECK("__new_invoices"."status" IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')),
	CONSTRAINT "invoices_units_chk" CHECK("__new_invoices"."consumption_units" >= 0),
	CONSTRAINT "invoices_rate_chk" CHECK("__new_invoices"."rate_per_unit_kes" IS NULL OR "__new_invoices"."rate_per_unit_kes" > 0),
	CONSTRAINT "invoices_paid_chk" CHECK("__new_invoices"."amount_paid_kes" >= 0),
	CONSTRAINT "invoices_period_chk" CHECK("__new_invoices"."billing_period_end" >= "__new_invoices"."billing_period_start")
);
--> statement-breakpoint
INSERT INTO `__new_invoices`("id", "client_id", "invoice_number", "billing_period_start", "billing_period_end", "consumption_units", "rate_per_unit_kes", "issued_by", "issued_at", "amount_paid_kes", "due_date", "status", "created_at", "updated_at") SELECT "id", "client_id", "invoice_number", "billing_period_start", "billing_period_end", "consumption_units", NULL, NULL, NULL, "amount_paid_kes", "due_date", "status", "created_at", "updated_at" FROM `invoices`;
--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoices` RENAME TO `invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `invoices_due_date_idx` ON `invoices` (`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_client_period_idx` ON `invoices` (`client_id`,`billing_period_start`);