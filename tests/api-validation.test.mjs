import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  currentShanghaiMonth,
  healthDateInShanghai,
  isCurrentSalaryMonth,
  isValidHealthApiKey,
  mergeHealthMetricCoverage,
  normalizeHealthIngestion,
  normalizeHealthPayload,
  parseHealthMetricCoverage,
  parseOptionalNumber,
  selectHealthUpdateFields,
  validDate,
  validMonth,
  validSalaryRecord,
} from "../app/api/validation.ts";
import { calculateSalary, SALARY_POLICY } from "../app/api/salary/policy.ts";
import { hasDashboardAccess } from "../app/api/access.ts";
import { validNormalizedFinanceTransaction } from "../app/features/finance/import-service.ts";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const healthRoute = readFileSync(resolve(root, "app/api/health/route.ts"), "utf8");

test("dashboard access rejects forged headers on the public workers.dev host", () => {
  assert.equal(hasDashboardAccess(new Request("https://pulse-health-dashboard.leopardser.workers.dev/api/salary", {
    headers: { "Cf-Access-Jwt-Assertion": "forged" },
  })), false);
  assert.equal(hasDashboardAccess(new Request("https://pulse.sophier.org/api/salary")), false);
  assert.equal(hasDashboardAccess(new Request("https://pulse.sophier.org/api/salary", {
    headers: { "Cf-Access-Jwt-Assertion": "access-protected" },
  })), true);
  assert.equal(hasDashboardAccess(new Request("http://localhost/api/salary")), true);
});

test("calendar accepts only canonical month and date values", () => {
  assert.equal(validMonth("2026-07"), true);
  assert.equal(validMonth("2026-7"), false);
  assert.equal(validMonth("July"), false);
  assert.equal(validDate("2026-07-28"), true);
  assert.equal(validDate("2026/07/28"), false);
});

test("salary record enforces month and workday boundaries", () => {
  assert.equal(validSalaryRecord({ month: "2026-07", workdays: 23 }), true);
  assert.equal(validSalaryRecord({ month: "2026-07", workdays: 32 }), false);
  assert.equal(validSalaryRecord({ month: "2026-7", workdays: 23 }), false);
  const july = new Date("2026-07-30T04:00:00.000Z");
  assert.equal(currentShanghaiMonth(july), "2026-07");
  assert.equal(isCurrentSalaryMonth("2026-07", july), true);
  assert.equal(isCurrentSalaryMonth("2026-06", july), false);
});

test("salary policy is fixed by the backend algorithm", () => {
  assert.deepEqual(SALARY_POLICY, {
    dailyRate: 275,
    deductions: 130,
    taxThreshold: 5000,
    taxRate: 3,
    extraIncome: 0,
    bonus: 0,
    leaveDeduction: 0,
  });
  assert.equal(Object.isFrozen(SALARY_POLICY), true);
  assert.equal(calculateSalary(23).grossSalary, 6325);
  assert.equal(calculateSalary(23).incomeTax, 35.85);
  assert.equal(calculateSalary(23).netSalary, 6159.15);
});

test("health upload requires an exact independent API key", () => {
  assert.equal(isValidHealthApiKey("secret", "secret"), true);
  assert.equal(isValidHealthApiKey("secret", "wrong"), false);
  assert.equal(isValidHealthApiKey("", ""), false);
});

test("health ingest records server-proven success metadata and date-level coverage", () => {
  assert.match(healthRoute, /const receivedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(healthRoute, /AUTO_EXPORT_HEALTH_SOURCE = "Auto Export Health"/);
  assert.match(healthRoute, /coveredDates: JSON\.stringify\(rows\.map/);
  assert.match(healthRoute, /importedDays: rows\.length[\s\S]*status: "success"/);
  assert.match(healthRoute, /rowsInserted[\s\S]*rowsUpdated[\s\S]*dataDateStart[\s\S]*dataDateEnd/);
  assert.match(healthRoute, /mergeHealthMetricCoverage/);
  assert.match(healthRoute, /metricCoverage/);
});

test("optional health numbers preserve absence and explicit zero", () => {
  for (const value of [undefined, null, "", "   ", "not-a-number", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(parseOptionalNumber(value), { present: false, value: null });
  }
  for (const [value, expected] of [[0, 0], ["0", 0], [123, 123], ["123", 123], ["123.45", 123.45]]) {
    assert.deepEqual(parseOptionalNumber(value), { present: true, value: expected });
  }
});

test("health dates use the Asia Shanghai natural day without shifting local dates twice", () => {
  assert.equal(healthDateInShanghai("2026-08-20T15:30:00Z"), "2026-08-20");
  assert.equal(healthDateInShanghai("2026-08-20T16:30:00Z"), "2026-08-21");
  assert.equal(healthDateInShanghai("2026-08-21T00:30:00+08:00"), "2026-08-21");
  assert.equal(healthDateInShanghai("2026-08-21"), "2026-08-21");
});

test("date-level health coverage is validated and merged without deleting previous presence", () => {
  assert.equal(parseHealthMetricCoverage(null), null);
  assert.deepEqual(parseHealthMetricCoverage("[]"), []);
  assert.deepEqual(parseHealthMetricCoverage('["steps","unknown","sleepMinutes"]'), ["steps", "sleepMinutes"]);
  assert.deepEqual(mergeHealthMetricCoverage('["steps"]', ["sleepMinutes", "steps"]), ["steps", "sleepMinutes"]);
  assert.deepEqual(mergeHealthMetricCoverage(null, []), []);
  const afterRealIngest = mergeHealthMetricCoverage(null, ["steps"]);
  assert.deepEqual(afterRealIngest, ["steps"]);
  assert.deepEqual(mergeHealthMetricCoverage(JSON.stringify(afterRealIngest), []), ["steps"]);
});

test("finance import accepts only normalized integer-cent QianJi records", () => {
  const base = { source: "qianji", sourceId: "qj-1", occurredAt: "2026-08-11T12:00:00+08:00", type: "expense", amountCents: 13609, currency: "CNY", rawType: "支出", rawCategory: "三餐", rawSubcategory: "午餐", accountFrom: "钱包", accountTo: "", note: "午餐", tags: [], lifeDomain: "food" };
  assert.equal(validNormalizedFinanceTransaction(base), true);
  assert.equal(validNormalizedFinanceTransaction({ ...base, amountCents: 136.09 }), false);
  assert.equal(validNormalizedFinanceTransaction({ ...base, source: "unknown" }), false);
});

test("health normalization aggregates supported metrics and clamps unsafe values", () => {
  const rows = normalizeHealthPayload({
    metrics: [
      { name: "step_count", data: [{ qty: 20, date: "2026-07-28 08:00:00 +0800" }, { qty: 30, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "active_energy", units: "kJ", data: [{ qty: 502.08, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "resting_energy", units: "kJ", data: [{ qty: 836.8, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "resting_heart_rate", units: "count/min", data: [{ qty: 58.4, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "apple_exercise_time", units: "hr", data: [{ qty: 0.5, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "weight_body_mass", units: "lb", data: [{ qty: 132.277, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "sleep_analysis", units: "hr", data: [
        { qty: 3.5, date: "2026-07-28 07:00:00 +0800", value: "Core" },
        { qty: 1, date: "2026-07-28 07:00:00 +0800", value: "Deep" },
        { qty: 0.5, date: "2026-07-28 07:00:00 +0800", value: "Awake" },
      ] },
      { name: "unknown_metric", data: [{ qty: 999, date: "2026-07-28" }] },
    ],
  });
  assert.deepEqual(rows, [{
    date: "2026-07-28",
    steps: 50,
    activeEnergyKcal: 120,
    restingEnergyKcal: 200,
    exerciseMinutes: 30,
    workoutCount: 0,
    weightKg: 60,
    sleepMinutes: 270,
    restingHeartRateBpm: 58.4,
    source: "health-auto-export",
  }]);

  assert.deepEqual(normalizeHealthPayload({ date: "2026-07-28", steps: 999_999 })[0].steps, 200_000);
  assert.equal(normalizeHealthPayload({ date: "2026-07-28", weightKg: 53.2 })[0].weightKg, 53.2);
  assert.equal(normalizeHealthPayload({
    metrics: [{ name: "active_energy", units: "kcal", data: [{ qty: 321, date: "2026-07-29" }] }],
  })[0].activeEnergyKcal, 321);
  assert.equal(normalizeHealthPayload({
    metrics: [{ name: "resting_heart_rate", units: "count/min", data: [{ qty: 300, date: "2026-07-29" }] }],
  })[0].restingHeartRateBpm, null);
  assert.equal(normalizeHealthPayload({
    metrics: [{
      name: "sleep_analysis",
      units: "hr",
      data: [{ date: "2026-07-29", totalSleep: 7.5, asleep: 7, core: 3.5, deep: 1.5, rem: 2 }],
    }],
  })[0].sleepMinutes, 450);
  assert.equal(normalizeHealthPayload({
    metrics: [{ name: "sleep_analysis", units: "hr", data: [{ date: "2026-07-29", totalSleep: 0, inBed: 8 }] }],
  })[0].sleepMinutes, 0);
  assert.deepEqual(normalizeHealthPayload({
    metrics: [{ name: "step_count", data: [
      { qty: 1, date: "2026-07-29" },
      { qty: 1, date: "2026-07-25" },
      { qty: 1, date: "2026-07-28" },
    ] }],
  }).map((row) => row.date), ["2026-07-25", "2026-07-28", "2026-07-29"]);
  assert.deepEqual(normalizeHealthPayload({ metrics: [{ name: "unsupported", data: [] }] }), []);
});

test("health ingestion distinguishes explicit zero values from omitted metrics", () => {
  const ingestion = normalizeHealthIngestion({
    metrics: [
      { name: "step_count", data: [{ qty: 0, date: "2026-08-09" }] },
      { name: "sleep_analysis", units: "hr", data: [{ qty: 7, date: "2026-08-09", value: "Core" }] },
    ],
  });

  assert.deepEqual(ingestion.coverage["2026-08-09"], ["steps", "sleepMinutes"]);
  assert.equal(ingestion.rows[0].steps, 0);
  assert.equal(ingestion.rows[0].activeEnergyKcal, 0);
  assert.deepEqual(selectHealthUpdateFields(
    ingestion.rows[0],
    ingestion.coverage["2026-08-09"],
  ), {
    steps: 0,
    sleepMinutes: 420,
    source: "health-auto-export",
  });
});

test("partial health uploads update only metrics actually included in the request", () => {
  const ingestion = normalizeHealthIngestion({
    metrics: [
      { name: "resting_heart_rate", units: "count/min", data: [{ qty: 61, date: "2026-08-09" }] },
      { name: "weight_body_mass", units: "kg", data: [{ qty: 0, date: "2026-08-09" }] },
    ],
  });

  assert.deepEqual(ingestion.coverage["2026-08-09"], ["restingHeartRateBpm"]);
  assert.deepEqual(selectHealthUpdateFields(
    ingestion.rows[0],
    ingestion.coverage["2026-08-09"],
  ), {
    restingHeartRateBpm: 61,
    source: "health-auto-export",
  });
  assert.equal(Object.hasOwn(selectHealthUpdateFields(ingestion.rows[0], ingestion.coverage["2026-08-09"]), "steps"), false);
  assert.equal(Object.hasOwn(selectHealthUpdateFields(ingestion.rows[0], ingestion.coverage["2026-08-09"]), "activeEnergyKcal"), false);
});

test("flat health payload aligns numeric strings with coverage and ignores absent values", () => {
  const ingestion = normalizeHealthIngestion({
    date: "2026-08-21",
    steps: "0",
    activeEnergyKcal: "157.01",
    restingEnergyKcal: null,
    exerciseMinutes: "   ",
  });
  assert.deepEqual(ingestion.coverage["2026-08-21"], ["steps", "activeEnergyKcal"]);
  assert.equal(ingestion.rows[0].steps, 0);
  assert.equal(ingestion.rows[0].activeEnergyKcal, 157.01);
  assert.deepEqual(selectHealthUpdateFields(ingestion.rows[0], ingestion.coverage["2026-08-21"]), {
    steps: 0,
    activeEnergyKcal: 157.01,
    source: "apple-health",
  });
});

test("workout coverage distinguishes missing, explicit empty, and dated workout rows", () => {
  const missing = normalizeHealthIngestion({ date: "2026-08-21", steps: 1 });
  assert.equal(missing.coverage["2026-08-21"].includes("workoutCount"), false);

  const empty = normalizeHealthIngestion({ date: "2026-08-21", workouts: [] });
  assert.deepEqual(empty.coverage["2026-08-21"], ["workoutCount"]);
  assert.equal(empty.rows[0].workoutCount, 0);

  const populated = normalizeHealthIngestion({
    metrics: [{ name: "step_count", data: [{ qty: 1, date: "2026-08-21" }] }],
    workouts: [
      { startDate: "2026-08-21T08:00:00+08:00" },
      { endDate: "2026-08-21T10:00:00+08:00" },
      { date: "2026-08-20T16:30:00Z" },
    ],
  });
  assert.equal(populated.rows[0].workoutCount, 3);
  assert.equal(populated.coverage["2026-08-21"].includes("workoutCount"), true);
});
