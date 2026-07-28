CREATE TABLE `calendar_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`schedule_note` text DEFAULT '' NOT NULL,
	`leave_note` text DEFAULT '' NOT NULL,
	`overtime_note` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_notes_month_unique` ON `calendar_notes` (`month`);