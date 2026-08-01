import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHealthSummary,
  getHealthMetricValue,
  selectTodayHealth,
  toChronologicalHealthHistory,
} from "../app/features/health/domain.ts";

const healthRecord = (overrides = {}) => ({
  date: "2026-08-01",
  steps: 8_000,
  activeEnergyKcal: 321.6,
  restingEnergyKcal: 1_600.2,
  exerciseMinutes: 75,
  workoutCount: 1,
  weightKg: 60.5,
  sleepMinutes: 420,
  restingHeartRateBpm: 58,
  source: "health-auto-export",
  updatedAt: "2026-08-01T08:00:00.000Z",
  ...overrides,
});

test("selectTodayHealth returns the matching Shanghai date without changing history", () => {
  const history = [healthRecord({ date: "2026-07-31" }), healthRecord()];
  const snapshot = structuredClone(history);

  assert.equal(selectTodayHealth(history, "2026-08-01"), history[1]);
  assert.equal(selectTodayHealth(history, "2026-08-02"), null);
  assert.deepEqual(history, snapshot);
});

test("toChronologicalHealthHistory reverses a copy and preserves its input", () => {
  const history = [healthRecord({ date: "2026-08-01" }), healthRecord({ date: "2026-07-31" })];
  const result = toChronologicalHealthHistory(history);

  assert.deepEqual(result.map((item) => item.date), ["2026-07-31", "2026-08-01"]);
  assert.deepEqual(history.map((item) => item.date), ["2026-08-01", "2026-07-31"]);
  assert.notEqual(result, history);
});

test("calculateHealthSummary preserves current dashboard rounding and fallback rules", () => {
  assert.deepEqual(calculateHealthSummary(healthRecord(), 8_500), {
    steps: 8_000,
    stepProgress: 94,
    activeEnergy: 322,
    totalEnergy: 1_922,
    exerciseHours: "1.3",
  });
  assert.equal(calculateHealthSummary(healthRecord({ steps: 20_000 }), 8_500).stepProgress, 100);
  assert.equal(calculateHealthSummary(healthRecord({ restingEnergyKcal: 0 }), 8_500).totalEnergy, null);
  assert.deepEqual(calculateHealthSummary(null, 8_500), {
    steps: 0,
    stepProgress: 0,
    activeEnergy: 0,
    totalEnergy: null,
    exerciseHours: "0.0",
  });
});

test("getHealthMetricValue preserves nullable metric and sleep conversion behavior", () => {
  const record = healthRecord();
  assert.equal(getHealthMetricValue(record, "steps"), 8_000);
  assert.equal(getHealthMetricValue(record, "activeEnergyKcal"), 321.6);
  assert.equal(getHealthMetricValue(record, "exerciseMinutes"), 75);
  assert.equal(getHealthMetricValue(record, "weightKg"), 60.5);
  assert.equal(getHealthMetricValue(record, "sleepMinutes"), 7);
  assert.equal(getHealthMetricValue(record, "restingHeartRateBpm"), 58);
  assert.equal(getHealthMetricValue(healthRecord({ weightKg: null }), "weightKg"), 0);
  assert.equal(getHealthMetricValue(healthRecord({ sleepMinutes: null }), "sleepMinutes"), 0);
  assert.equal(getHealthMetricValue(healthRecord({ restingHeartRateBpm: null }), "restingHeartRateBpm"), 0);
});
