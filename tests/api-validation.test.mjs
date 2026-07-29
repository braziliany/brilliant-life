import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidHealthApiKey,
  normalizeHealthPayload,
  validDate,
  validMonth,
  validSalaryRecord,
  validSalaryRecordDeletion,
} from "../app/api/validation.ts";
import { calculateSalary, SALARY_POLICY } from "../app/api/salary/policy.ts";
import { hasDashboardAccess } from "../app/api/access.ts";

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
  assert.equal(validSalaryRecordDeletion({ month: "2026-07" }), true);
  assert.equal(validSalaryRecordDeletion({ month: "2026-7" }), false);
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
  })[0].sleepMinutes, null);
  assert.deepEqual(normalizeHealthPayload({
    metrics: [{ name: "step_count", data: [
      { qty: 1, date: "2026-07-29" },
      { qty: 1, date: "2026-07-25" },
      { qty: 1, date: "2026-07-28" },
    ] }],
  }).map((row) => row.date), ["2026-07-25", "2026-07-28", "2026-07-29"]);
  assert.deepEqual(normalizeHealthPayload({ metrics: [{ name: "unsupported", data: [] }] }), []);
});
