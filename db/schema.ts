import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    weightKg: real("weight_kg"),
    sleepMinutes: real("sleep_minutes"),
    restingHeartRateBpm: real("resting_heart_rate_bpm"),
    metricCoverage: text("metric_coverage"),
    source: text("source").notNull().default("apple-health"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("health_daily_date_unique").on(table.date)]
);

export const healthIngestionRuns = sqliteTable(
  "health_ingestion_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    coveredDates: text("covered_dates").notNull().default("[]"),
    metricKeys: text("metric_keys").notNull().default("[]"),
    importedDays: integer("imported_days").notNull().default(0),
    status: text("status", {
      enum: ["success", "no_supported_metrics", "invalid_payload"],
    }).notNull(),
    source: text("source"),
  },
  (table) => [index("health_ingestion_runs_received_at_idx").on(table.receivedAt)]
);

export const calendarWorkRecords = sqliteTable("calendar_work_records", {
  date: text("date").primaryKey(),
  worked: integer("worked", { mode: "boolean" }).notNull(),
  hours: real("hours"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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

export const financeTransactions = sqliteTable(
  "finance_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    type: text("type", { enum: ["expense", "income", "refund", "transfer", "repayment"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("CNY"),
    rawType: text("raw_type").notNull().default(""),
    rawCategory: text("raw_category").notNull().default(""),
    rawSubcategory: text("raw_subcategory").notNull().default(""),
    accountFrom: text("account_from").notNull().default(""),
    accountTo: text("account_to").notNull().default(""),
    note: text("note").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    lifeDomain: text("life_domain").notNull().default("other"),
    lifeDomainOverride: text("life_domain_override"),
    personId: integer("person_id"),
    projectId: integer("project_id"),
    assetId: integer("asset_id"),
    eventId: integer("event_id"),
    placeId: integer("place_id"),
    semanticNote: text("semantic_note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("finance_transactions_source_source_id_unique").on(table.source, table.sourceId),
    index("finance_transactions_occurred_at_idx").on(table.occurredAt),
    index("finance_transactions_life_domain_idx").on(table.lifeDomain),
  ]
);

export const possessionWishes = sqliteTable("possession_wishes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  budgetCents: integer("budget_cents"),
  plannedDate: text("planned_date"),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["wanted", "purchased", "cancelled"] }).notNull().default("wanted"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  check("possession_wishes_budget_check", sql`${table.budgetCents} IS NULL OR (${table.budgetCents} >= 0 AND typeof(${table.budgetCents}) = 'integer')`),
  check("possession_wishes_status_check", sql`${table.status} IN ('wanted','purchased','cancelled')`),
  index("possession_wishes_planned_date_idx").on(table.plannedDate),
]);

export const possessionItems = sqliteTable("possession_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  brandModel: text("brand_model"),
  purchaseDate: text("purchase_date"),
  purchasePriceCents: integer("purchase_price_cents"),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["in_use", "idle", "sold", "gifted", "retired"] }).notNull().default("in_use"),
  endedDate: text("ended_date"),
  archivedAt: text("archived_at"),
  sourceWishId: integer("source_wish_id").references(() => possessionWishes.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  uniqueIndex("possession_items_source_wish_unique").on(table.sourceWishId),
  index("possession_items_purchase_date_idx").on(table.purchaseDate),
  index("possession_items_ended_date_idx").on(table.endedDate),
  check("possession_items_price_check", sql`${table.purchasePriceCents} IS NULL OR (${table.purchasePriceCents} >= 0 AND typeof(${table.purchasePriceCents}) = 'integer')`),
  check("possession_items_status_check", sql`${table.status} IN ('in_use','idle','sold','gifted','retired')`),
  check("possession_items_end_check", sql`((${table.status} IN ('in_use','idle') AND ${table.endedDate} IS NULL) OR (${table.status} IN ('sold','gifted','retired') AND ${table.endedDate} IS NOT NULL)) AND (${table.purchaseDate} IS NULL OR ${table.endedDate} IS NULL OR ${table.endedDate} >= ${table.purchaseDate})`),
]);

export const possessionUses = sqliteTable("possession_uses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => possessionItems.id, { onDelete: "restrict" }),
  usedOn: text("used_on").notNull(),
  count: integer("count").notNull().default(1),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("possession_uses_item_date_idx").on(table.itemId, table.usedOn),
  index("possession_uses_date_idx").on(table.usedOn),
  check("possession_uses_count_check", sql`typeof(${table.count}) = 'integer' AND ${table.count} BETWEEN 1 AND 1000000`),
]);
