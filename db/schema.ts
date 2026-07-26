import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const healthDaily = sqliteTable(
  "health_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    steps: integer("steps").notNull().default(0),
    activeEnergyKcal: real("active_energy_kcal").notNull().default(0),
    exerciseMinutes: real("exercise_minutes").notNull().default(0),
    workoutCount: integer("workout_count").notNull().default(0),
    source: text("source").notNull().default("apple-health"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("health_daily_date_unique").on(table.date)]
);

export const calendarOverrides = sqliteTable(
  "calendar_overrides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    isWorkday: integer("is_workday", { mode: "boolean" }).notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("calendar_overrides_date_unique").on(table.date)]
);
