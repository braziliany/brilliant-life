import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidHealthApiKey,
  normalizeHealthPayload,
  validDate,
  validMonth,
  validSalaryAdjustments,
  validSalaryRecord,
  validSalarySettings,
} from "../app/api/validation.ts";

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
});

test("salary adjustments reject missing, negative, and excessive values", () => {
  assert.equal(validSalaryAdjustments({ extraIncome: 0, bonus: 500, leaveDeduction: 0 }), true);
  assert.equal(validSalaryAdjustments({ extraIncome: -1, bonus: 0, leaveDeduction: 0 }), false);
  assert.equal(validSalaryAdjustments({ extraIncome: 0, bonus: 1_000_001, leaveDeduction: 0 }), false);
});

test("salary settings distinguish invalid and out-of-range input", () => {
  assert.equal(validSalarySettings({ dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 3 }), "valid");
  assert.equal(validSalarySettings({ dailyRate: "275", deductions: 130, taxThreshold: 5000, taxRate: 3 }), "invalid");
  assert.equal(validSalarySettings({ dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 101 }), "out-of-range");
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
      { name: "active_energy", data: [{ qty: 120, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "apple_exercise_time", units: "hr", data: [{ qty: 0.5, date: "2026-07-28 09:00:00 +0800" }] },
      { name: "unknown_metric", data: [{ qty: 999, date: "2026-07-28" }] },
    ],
  });
  assert.deepEqual(rows, [{
    date: "2026-07-28",
    steps: 50,
    activeEnergyKcal: 120,
    restingEnergyKcal: 0,
    exerciseMinutes: 30,
    workoutCount: 0,
    source: "health-auto-export",
  }]);

  assert.deepEqual(normalizeHealthPayload({ date: "2026-07-28", steps: 999_999 })[0].steps, 200_000);
  assert.deepEqual(normalizeHealthPayload({ metrics: [{ name: "unsupported", data: [] }] }), []);
});
