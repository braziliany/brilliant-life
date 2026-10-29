CREATE TABLE `possession_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`brand_model` text,
	`purchase_date` text,
	`purchase_price_cents` integer,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'in_use' NOT NULL,
	`ended_date` text,
	`archived_at` text,
	`source_wish_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_wish_id`) REFERENCES `possession_wishes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "possession_items_price_check" CHECK("possession_items"."purchase_price_cents" IS NULL OR ("possession_items"."purchase_price_cents" >= 0 AND typeof("possession_items"."purchase_price_cents") = 'integer')),
	CONSTRAINT "possession_items_status_check" CHECK("possession_items"."status" IN ('in_use','idle','sold','gifted','retired')),
	CONSTRAINT "possession_items_end_check" CHECK((("possession_items"."status" IN ('in_use','idle') AND "possession_items"."ended_date" IS NULL) OR ("possession_items"."status" IN ('sold','gifted','retired') AND "possession_items"."ended_date" IS NOT NULL)) AND ("possession_items"."purchase_date" IS NULL OR "possession_items"."ended_date" IS NULL OR "possession_items"."ended_date" >= "possession_items"."purchase_date"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `possession_items_source_wish_unique` ON `possession_items` (`source_wish_id`);--> statement-breakpoint
CREATE INDEX `possession_items_purchase_date_idx` ON `possession_items` (`purchase_date`);--> statement-breakpoint
CREATE INDEX `possession_items_ended_date_idx` ON `possession_items` (`ended_date`);--> statement-breakpoint
CREATE TABLE `possession_uses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`used_on` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `possession_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "possession_uses_count_check" CHECK(typeof("possession_uses"."count") = 'integer' AND "possession_uses"."count" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE INDEX `possession_uses_item_date_idx` ON `possession_uses` (`item_id`,`used_on`);--> statement-breakpoint
CREATE INDEX `possession_uses_date_idx` ON `possession_uses` (`used_on`);--> statement-breakpoint
CREATE TABLE `possession_wishes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`budget_cents` integer,
	`planned_date` text,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'wanted' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "possession_wishes_budget_check" CHECK("possession_wishes"."budget_cents" IS NULL OR ("possession_wishes"."budget_cents" >= 0 AND typeof("possession_wishes"."budget_cents") = 'integer')),
	CONSTRAINT "possession_wishes_status_check" CHECK("possession_wishes"."status" IN ('wanted','purchased','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `possession_wishes_planned_date_idx` ON `possession_wishes` (`planned_date`);