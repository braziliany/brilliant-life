CREATE TABLE `calendar_work_records` (
	`date` text PRIMARY KEY NOT NULL,
	`worked` integer NOT NULL,
	`hours` real,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
