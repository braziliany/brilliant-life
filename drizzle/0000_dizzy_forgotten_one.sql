CREATE TABLE `health_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`steps` integer DEFAULT 0 NOT NULL,
	`active_energy_kcal` real DEFAULT 0 NOT NULL,
	`exercise_minutes` real DEFAULT 0 NOT NULL,
	`workout_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'apple-health' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_daily_date_unique` ON `health_daily` (`date`);