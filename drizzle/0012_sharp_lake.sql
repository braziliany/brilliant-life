CREATE TABLE `health_ingestion_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`covered_dates` text DEFAULT '[]' NOT NULL,
	`metric_keys` text DEFAULT '[]' NOT NULL,
	`imported_days` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE INDEX `health_ingestion_runs_received_at_idx` ON `health_ingestion_runs` (`received_at`);