CREATE TABLE `mpesa_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checkout_request_id` text NOT NULL,
	`merchant_request_id` text,
	`client_id` integer NOT NULL,
	`invoice_id` integer,
	`phone_number` text NOT NULL,
	`amount_kes` numeric NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`result_code` text,
	`result_description` text,
	`mpesa_receipt_number` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`raw_callback` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "mpesa_transactions_status_chk" CHECK("mpesa_transactions"."status" IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMED_OUT')),
	CONSTRAINT "mpesa_transactions_amount_chk" CHECK("mpesa_transactions"."amount_kes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mpesa_transactions_checkout_request_id_unique` ON `mpesa_transactions` (`checkout_request_id`);--> statement-breakpoint
CREATE INDEX `mpesa_transactions_client_idx` ON `mpesa_transactions` (`client_id`);--> statement-breakpoint
CREATE INDEX `mpesa_transactions_status_idx` ON `mpesa_transactions` (`status`);