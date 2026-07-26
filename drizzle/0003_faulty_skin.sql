CREATE TABLE `salary_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_rate` real DEFAULT 275 NOT NULL,
	`deductions` real DEFAULT 130 NOT NULL,
	`tax_threshold` real DEFAULT 5000 NOT NULL,
	`tax_rate` real DEFAULT 3 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
