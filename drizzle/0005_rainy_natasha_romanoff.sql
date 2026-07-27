ALTER TABLE `salary_records` ADD `tax_threshold` real DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `salary_records` ADD `tax_rate` real DEFAULT 3 NOT NULL;