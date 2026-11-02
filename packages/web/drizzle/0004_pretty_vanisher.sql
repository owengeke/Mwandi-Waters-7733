CREATE TABLE `meter_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`reading_value` numeric NOT NULL,
	`previous_reading` numeric NOT NULL,
	`units_consumed` numeric DEFAULT 0 NOT NULL,
	`reading_date` text NOT NULL,
	`recorded_by` text,
	`invoice_id` integer,
	`is_opening` integer DEFAULT false NOT NULL,
	`meter_number` text,
	`corrected_by` text,
	`corrected_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "meter_readings_value_chk" CHECK("meter_readings"."reading_value" >= 0),
	CONSTRAINT "meter_readings_previous_chk" CHECK("meter_readings"."previous_reading" >= 0),
	CONSTRAINT "meter_readings_units_chk" CHECK("meter_readings"."units_consumed" >= 0),
	CONSTRAINT "meter_readings_opening_chk" CHECK("meter_readings"."is_opening" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `meter_readings_client_idx` ON `meter_readings` (`client_id`);--> statement-breakpoint
CREATE INDEX `meter_readings_client_date_idx` ON `meter_readings` (`client_id`,`reading_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `meter_readings_invoice_idx` ON `meter_readings` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `meter_readings_client_reading_idx` ON `meter_readings` (`client_id`,`reading_date`,`reading_value`) WHERE "meter_readings"."is_opening" = 0;--> statement-breakpoint
DROP INDEX `invoices_client_period_idx`;--> statement-breakpoint
CREATE INDEX `invoices_client_period_idx` ON `invoices` (`client_id`,`billing_period_start`);--> statement-breakpoint
/*
 * Backfill meter_readings from existing invoices, without touching any invoice.
 *
 * Real meter values and the original opening readings were never stored, so the
 * chain is synthesised: opening = 0, then each invoice's consumption is added to
 * the running total. Units therefore match the existing bills exactly, but the
 * absolute meter numbers are inferred, not historical. Clients with no invoices
 * get no rows on purpose — the admin sets their opening reading in the UI.
 */
INSERT OR IGNORE INTO `meter_readings` (`client_id`, `reading_value`, `previous_reading`, `units_consumed`, `reading_date`, `recorded_by`, `invoice_id`, `is_opening`, `meter_number`, `created_at`)
SELECT i.`client_id`, 0, 0, 0, date(min(i.`billing_period_start`), '-1 day'), 'backfill', NULL, 1,
       (SELECT c.`meter_number` FROM `clients` c WHERE c.`id` = i.`client_id`), unixepoch()
FROM `invoices` i
WHERE NOT EXISTS (SELECT 1 FROM `meter_readings` mr WHERE mr.`client_id` = i.`client_id`)
GROUP BY i.`client_id`;--> statement-breakpoint
INSERT OR IGNORE INTO `meter_readings` (`client_id`, `reading_value`, `previous_reading`, `units_consumed`, `reading_date`, `recorded_by`, `invoice_id`, `is_opening`, `meter_number`, `created_at`)
SELECT i.`client_id`,
       round(SUM(i.`consumption_units`) OVER w, 2),
       round(SUM(i.`consumption_units`) OVER w - i.`consumption_units`, 2),
       i.`consumption_units`,
       i.`billing_period_end`,
       'backfill',
       i.`id`,
       0,
       (SELECT c.`meter_number` FROM `clients` c WHERE c.`id` = i.`client_id`),
       unixepoch()
FROM `invoices` i
WHERE NOT EXISTS (SELECT 1 FROM `meter_readings` mr WHERE mr.`invoice_id` = i.`id`)
WINDOW w AS (PARTITION BY i.`client_id` ORDER BY i.`billing_period_start`, i.`id`);