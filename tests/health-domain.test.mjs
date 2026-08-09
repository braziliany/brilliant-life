import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHealthIngestionContinuity,
  calculateHealthSummary,
  calculateHealthTrend,
  calculateWeightTrend,
  findLatestSuccessfulIngestionForDate,
  getHealthMetricValue,
  getMissingTodayHealthMetrics,
  getRecentHealthDateKeys,
  healthIngestionShanghaiDate,
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

test("calculateHealthTrend preserves period slicing, nullable filtering, and averages", () => {
  const history = Array.from({ length: 10 }, (_, index) => healthRecord({
    date: `2026-07-${String(23 + index).padStart(2, "0")}`,
    steps: (index + 1) * 1_000,
    weightKg: index === 5 ? null : 60 + index / 10,
    sleepMinutes: index === 5 ? null : 360 + index * 6,
    restingHeartRateBpm: index === 5 ? null : 55 + index,
  }));

  const stepsTrend = calculateHealthTrend(history, 7, "steps");
  assert.equal(stepsTrend.visibleHistory.length, 7);
  assert.equal(stepsTrend.visibleHistory[0].steps, 4_000);
  assert.equal(stepsTrend.metricHistory.length, 7);
  assert.equal(stepsTrend.metricMax, 10_000);
  assert.equal(stepsTrend.metricAverage, 7_000);
  assert.equal(stepsTrend.metricAverageLabel, "7,000");

  const weightTrend = calculateHealthTrend(history, 7, "weightKg");
  assert.equal(weightTrend.metricHistory.length, 6);
  assert.equal(weightTrend.metricHistory.some((item) => item.weightKg === null), false);
  assert.equal(weightTrend.metricAverageLabel, weightTrend.metricAverage.toFixed(1));

  const sleepTrend = calculateHealthTrend(history, 30, "sleepMinutes");
  assert.equal(sleepTrend.visibleHistory.length, 10);
  assert.equal(sleepTrend.metricHistory.length, 9);
  assert.equal(sleepTrend.metricAverageLabel, sleepTrend.metricAverage.toFixed(1));

  const heartTrend = calculateHealthTrend(history, 30, "restingHeartRateBpm");
  assert.equal(heartTrend.metricHistory.length, 9);
  assert.equal(heartTrend.metricAverageLabel, Math.round(heartTrend.metricAverage).toLocaleString("zh-CN"));

  const energyTrend = calculateHealthTrend(history, 7, "activeEnergyKcal");
  assert.equal(energyTrend.metricHistory.length, 7);
  const exerciseTrend = calculateHealthTrend(history, 7, "exerciseMinutes");
  assert.equal(exerciseTrend.metricHistory.length, 7);

  assert.deepEqual(calculateHealthTrend([], 7, "steps"), {
    visibleHistory: [],
    metricHistory: [],
    metricMax: 1,
    metricAverage: 0,
    metricAverageLabel: "0",
  });
});

test("calculateWeightTrend preserves recent-record and chart-range behavior", () => {
  const history = Array.from({ length: 16 }, (_, index) => healthRecord({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    weightKg: index === 1 ? null : 60 + index / 10,
  }));
  const trend = calculateWeightTrend(history);

  assert.equal(trend.recentWeightHistory.length, 14);
  assert.equal(trend.latestWeight, 61.5);
  assert.equal(trend.recentWeightHistory[0].weightKg, 60.2);
  assert.ok(Math.abs(trend.weightChange - 1.3) < 1e-9);
  assert.equal(trend.recentWeightMin, 60.2);
  assert.ok(Math.abs(trend.recentWeightRange - 1.3) < 1e-9);

  assert.deepEqual(calculateWeightTrend([]), {
    recentWeightHistory: [],
    latestWeight: null,
    weightChange: null,
    recentWeightMin: 0,
    recentWeightRange: 1,
  });

  const oneRecord = calculateWeightTrend([healthRecord({ weightKg: 60 })]);
  assert.equal(oneRecord.weightChange, null);
  assert.equal(oneRecord.recentWeightRange, 0.1);
});

test("getMissingTodayHealthMetrics returns only the current optional metric keys", () => {
  assert.deepEqual(getMissingTodayHealthMetrics(null), []);
  assert.deepEqual(getMissingTodayHealthMetrics(healthRecord()), []);
  assert.deepEqual(getMissingTodayHealthMetrics(healthRecord({
    weightKg: null,
    sleepMinutes: null,
    restingHeartRateBpm: null,
  })), ["weightKg", "sleepMinutes", "restingHeartRateBpm"]);
});

test("health ingestion dates preserve Shanghai timezone and seven-day boundaries", () => {
  assert.equal(healthIngestionShanghaiDate("2026-08-08T16:30:00.000Z"), "2026-08-09");
  assert.equal(healthIngestionShanghaiDate("invalid"), null);
  assert.deepEqual(getRecentHealthDateKeys("2026-08-09"), [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ]);
});

test("health ingestion continuity distinguishes success, failure, and no request", () => {
  const ingestions = [
    { id: 4, receivedAt: "2026-08-09T01:00:00.000Z", coveredDates: ["2026-08-09"], metricKeys: ["steps"], importedDays: 1, status: "success", source: "health-auto-export" },
    { id: 3, receivedAt: "2026-08-08T01:00:00.000Z", coveredDates: [], metricKeys: [], importedDays: 0, status: "invalid_payload", source: null },
    { id: 2, receivedAt: "2026-08-07T01:00:00.000Z", coveredDates: ["2026-08-06", "2026-08-07"], metricKeys: ["sleepMinutes"], importedDays: 2, status: "success", source: "health-auto-export" },
  ];
  const result = calculateHealthIngestionContinuity(ingestions, "2026-08-09");

  assert.deepEqual(result.receivedDateKeys, ["2026-08-07", "2026-08-08", "2026-08-09"]);
  assert.deepEqual(result.successfulDateKeys, ["2026-08-07", "2026-08-09"]);
  assert.deepEqual(result.failedDateKeys, ["2026-08-08"]);
  assert.deepEqual(result.missingDateKeys, ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
  assert.equal(findLatestSuccessfulIngestionForDate(ingestions, "2026-08-09"), ingestions[0]);
  assert.equal(findLatestSuccessfulIngestionForDate(ingestions, "2026-08-08"), null);
});
