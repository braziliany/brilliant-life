CREATE TABLE `salary_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`workdays` integer NOT NULL,
	`daily_rate` real NOT NULL,
	`deductions` real NOT NULL,
	`gross_salary` real NOT NULL,
	`taxable_income` real NOT NULL,
	`income_tax` real NOT NULL,
	`net_salary` real NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_records_month_unique` ON `salary_records` (`month`);