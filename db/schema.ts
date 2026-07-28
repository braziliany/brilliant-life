import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const healthDaily = sqliteTable(
  "health_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    steps: integer("steps").notNull().default(0),
    activeEnergyKcal: real("active_energy_kcal").notNull().default(0),
    restingEnergyKcal: real("resting_energy_kcal").notNull().default(0),
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

export const calendarNotes = sqliteTable(
  "calendar_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(),
    scheduleNote: text("schedule_note").notNull().default(""),
    leaveNote: text("leave_note").notNull().default(""),
    overtimeNote: text("overtime_note").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("calendar_notes_month_unique").on(table.month)]
);

export const salaryRecords = sqliteTable(
  "salary_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(),
    workdays: integer("workdays").notNull(),
    dailyRate: real("daily_rate").notNull(),
    deductions: real("deductions").notNull(),
    taxThreshold: real("tax_threshold").notNull().default(5000),
    taxRate: real("tax_rate").notNull().default(3),
    extraIncome: real("extra_income").notNull().default(0),
    bonus: real("bonus").notNull().default(0),
    leaveDeduction: real("leave_deduction").notNull().default(0),
    grossSalary: real("gross_salary").notNull(),
    taxableIncome: real("taxable_income").notNull(),
    incomeTax: real("income_tax").notNull(),
    netSalary: real("net_salary").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("salary_records_month_unique").on(table.month)]
);

export const salarySettings = sqliteTable("salary_settings", {
  id: text("id").primaryKey(),
  dailyRate: real("daily_rate").notNull().default(275),
  deductions: real("deductions").notNull().default(130),
  taxThreshold: real("tax_threshold").notNull().default(5000),
  taxRate: real("tax_rate").notNull().default(3),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workExperiences = sqliteTable("work_experiences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  role: text("role").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  summary: text("summary").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
