CREATE TABLE `finance_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`raw_type` text DEFAULT '' NOT NULL,
	`raw_category` text DEFAULT '' NOT NULL,
	`raw_subcategory` text DEFAULT '' NOT NULL,
	`account_from` text DEFAULT '' NOT NULL,
	`account_to` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`life_domain` text DEFAULT 'other' NOT NULL,
	`life_domain_override` text,
	`person_id` integer,
	`project_id` integer,
	`asset_id` integer,
	`event_id` integer,
	`place_id` integer,
	`semantic_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_transactions_source_source_id_unique` ON `finance_transactions` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_occurred_at_idx` ON `finance_transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `finance_transactions_life_domain_idx` ON `finance_transactions` (`life_domain`);