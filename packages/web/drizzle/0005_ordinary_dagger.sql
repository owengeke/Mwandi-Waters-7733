CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `onboarding_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer,
	`client_id` integer,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `installation_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_tokens_token_hash_unique` ON `onboarding_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `onboarding_tokens_application_idx` ON `onboarding_tokens` (`application_id`);--> statement-breakpoint
CREATE INDEX `onboarding_tokens_client_idx` ON `onboarding_tokens` (`client_id`);--> statement-breakpoint
/*
 * The clients table is rebuilt below to widen the status CHECK for DRAFT.
 * drizzle-kit emits the rebuild in one block but forgets to add the new columns
 * first, so add them here; the copy then has every column it selects.
 */
ALTER TABLE `clients` ADD `email` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `property_type` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `occupant_type` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `estate` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `plot_or_house_no` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `landmark` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `landlord_phone` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `created_via` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_number` text NOT NULL,
	`full_name` text NOT NULL,
	`phone_number` text NOT NULL,
	`email` text,
	`meter_number` text NOT NULL,
	`current_balance_kes` numeric DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`property_type` text,
	`occupant_type` text,
	`estate` text,
	`plot_or_house_no` text,
	`landmark` text,
	`landlord_phone` text,
	`created_via` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "clients_status_chk" CHECK("__new_clients"."status" IN ('ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'DRAFT'))
);
--> statement-breakpoint
INSERT INTO `__new_clients`("id", "account_number", "full_name", "phone_number", "email", "meter_number", "current_balance_kes", "status", "property_type", "occupant_type", "estate", "plot_or_house_no", "landmark", "landlord_phone", "created_via", "created_at", "updated_at") SELECT "id", "account_number", "full_name", "phone_number", "email", "meter_number", "current_balance_kes", "status", "property_type", "occupant_type", "estate", "plot_or_house_no", "landmark", "landlord_phone", "created_via", "created_at", "updated_at" FROM `clients`;--> statement-breakpoint
DROP TABLE `clients`;--> statement-breakpoint
ALTER TABLE `__new_clients` RENAME TO `clients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `clients_account_number_unique` ON `clients` (`account_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_meter_number_unique` ON `clients` (`meter_number`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `clients_phone_idx` ON `clients` (`phone_number`);--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `email` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `property_type` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `occupant_type` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `estate` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `plot_or_house_no` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `landmark` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `landlord_phone` text;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `whatsapp_consent_at` integer;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `details_completed_at` integer;--> statement-breakpoint
ALTER TABLE `installation_requests` ADD `password_hash` text;