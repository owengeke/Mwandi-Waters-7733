CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_number` text NOT NULL,
	`full_name` text NOT NULL,
	`phone_number` text NOT NULL,
	`meter_number` text NOT NULL,
	`current_balance_kes` numeric DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "clients_status_chk" CHECK("clients"."status" IN ('ACTIVE', 'SUSPENDED', 'DISCONNECTED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_account_number_unique` ON `clients` (`account_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_meter_number_unique` ON `clients` (`meter_number`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `clients_phone_idx` ON `clients` (`phone_number`);--> statement-breakpoint
CREATE TABLE `installation_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_number` text NOT NULL,
	`full_name` text NOT NULL,
	`phone_number` text NOT NULL,
	`physical_address` text NOT NULL,
	`status` text DEFAULT 'PENDING_REVIEW' NOT NULL,
	`installation_fee_kes` numeric DEFAULT 0 NOT NULL,
	`rejection_reason` text,
	`client_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_requests_status_chk" CHECK("installation_requests"."status" IN ('PENDING_REVIEW', 'APPROVED_PENDING_PAYMENT', 'PAID', 'INSTALLED', 'REJECTED')),
	CONSTRAINT "installation_requests_fee_chk" CHECK("installation_requests"."installation_fee_kes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installation_requests_reference_number_unique` ON `installation_requests` (`reference_number`);--> statement-breakpoint
CREATE INDEX `installation_requests_status_idx` ON `installation_requests` (`status`);--> statement-breakpoint
CREATE INDEX `installation_requests_phone_idx` ON `installation_requests` (`phone_number`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`billing_period_start` text NOT NULL,
	`billing_period_end` text NOT NULL,
	`consumption_units` numeric NOT NULL,
	`amount_due_kes` numeric GENERATED ALWAYS AS (round(consumption_units * 150, 2)) STORED,
	`amount_paid_kes` numeric DEFAULT 0 NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'UNPAID' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoices_status_chk" CHECK("invoices"."status" IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')),
	CONSTRAINT "invoices_units_chk" CHECK("invoices"."consumption_units" >= 0),
	CONSTRAINT "invoices_paid_chk" CHECK("invoices"."amount_paid_kes" >= 0),
	CONSTRAINT "invoices_period_chk" CHECK("invoices"."billing_period_end" >= "invoices"."billing_period_start")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `invoices_due_date_idx` ON `invoices` (`due_date`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`invoice_id` integer,
	`mpesa_receipt_number` text,
	`payment_channel` text NOT NULL,
	`amount_paid_kes` numeric NOT NULL,
	`payment_date` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payments_channel_chk" CHECK("payments"."payment_channel" IN ('MPESA_PAYBILL', 'MPESA_STK_PUSH', 'BANK_TRANSFER', 'CASH')),
	CONSTRAINT "payments_amount_chk" CHECK("payments"."amount_paid_kes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_mpesa_receipt_number_unique` ON `payments` (`mpesa_receipt_number`);--> statement-breakpoint
CREATE INDEX `payments_client_idx` ON `payments` (`client_id`);--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_date_idx` ON `payments` (`payment_date`);