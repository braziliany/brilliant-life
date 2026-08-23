import assert from "node:assert/strict";
import test from "node:test";

import {
  createFinanceCashFlowInsight,
  createHealthWorkdayInsight,
  createSalaryTrendInsight,
  generateLifeInsights,
} from "../app/features/insights/domain.ts";

const health = (date, values = {}) => ({
  date,
  steps: 100,
  activeEnergyKcal: 10,
  restingEnergyKcal: 1000,
  exerciseMinutes: 10,
  workoutCount: 0,
  weightKg: null,
  sleepMinutes: null,
  restingHeartRateBpm: null,
  metricCoverage: JSON.stringify(["steps", "exerciseMinutes"]),
  source: "synthetic",
  updatedAt: `${date}T12:00:00Z`,
  ...values,
});

const salary = (month, netSalary, workdays = 21) => ({
  month,
  workdays,
  dailyRate: 0,
  grossSalary: 0,
  deductions: 0,
  taxThreshold: 0,
  taxRate: 0,
  taxableIncome: 0,
  extraIncome: 0,
  bonus: 0,
  leaveDeduction: 0,
  incomeTax: 0,
  netSalary,
});

const financeSummary = (overrides = {}) => ({
  facts: {
    recordCount: 3,
    dateStart: "2026-01-01",
    dateEnd: "2026-08-11",
    incomeCents: 1_000_000,
    netExpenseCents: 600_000,
    ...overrides.facts,
  },
  coverage: {
    sourceCutoffDate: "2026-08-11",
    annualAsOfDate: "2026-08-22",
    ...overrides.coverage,
  },
});

const healthComparisonOverrides = {
  "2026-01-03": false,
  "2026-01-04": false,
  "2026-01-05": true,
  "2026-01-06": true,
  "2026-01-07": true,
  "2026-01-10": false,
};

test("Health × Calendar returns available workday and non-workday step averages", () => {
  const insight = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-11",
    metric: "steps",
    calendarOverrides: healthComparisonOverrides,
    healthRecords: [
      health("2026-01-05", { steps: 100 }),
      health("2026-01-06", { steps: 300 }),
      health("2026-01-07", { steps: 500 }),
      health("2026-01-03", { steps: 300 }),
      health("2026-01-04", { steps: 500 }),
      health("2026-01-10", { steps: 500 }),
    ],
  });
  assert.equal(insight.availability, "available");
  assert.deepEqual(insight.value, {
    workdayAverage: 300,
    nonWorkdayAverage: 433.33,
    difference: -133.33,
    workdayDays: 3,
    nonWorkdayDays: 3,
  });
  assert.equal(insight.coverage.groups.workdays.trusted, 3);
  assert.equal(insight.coverage.groups.nonWorkdays.trusted, 3);
});

test("Health minimum sample availability requires three days in each comparison group", () => {
  const cases = [
    {
      name: "zero workdays",
      records: [health("2026-01-03"), health("2026-01-04"), health("2026-01-10")],
      expected: "unavailable",
    },
    {
      name: "one day in each group",
      records: [health("2026-01-05"), health("2026-01-10")],
      expected: "partial",
    },
    {
      name: "two workdays and three non-workdays",
      records: [
        health("2026-01-05"),
        health("2026-01-06"),
        health("2026-01-03"),
        health("2026-01-04"),
        health("2026-01-10"),
      ],
      expected: "partial",
    },
    {
      name: "three days in each trusted group",
      records: [
        health("2026-01-05"),
        health("2026-01-06"),
        health("2026-01-07"),
        health("2026-01-03"),
        health("2026-01-04"),
        health("2026-01-10"),
      ],
      expected: "available",
    },
  ];

  for (const item of cases) {
    const insight = createHealthWorkdayInsight({
      year: 2026,
      asOfDate: "2026-01-11",
      metric: "steps",
      calendarOverrides: healthComparisonOverrides,
      healthRecords: item.records,
    });
    assert.equal(insight.availability, item.expected, item.name);
  }
});

test("Health comparison remains partial when both groups meet the minimum but include legacy records", () => {
  const insight = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-11",
    metric: "steps",
    calendarOverrides: healthComparisonOverrides,
    healthRecords: [
      health("2026-01-05", { metricCoverage: null }),
      health("2026-01-06"),
      health("2026-01-07"),
      health("2026-01-03"),
      health("2026-01-04"),
      health("2026-01-10"),
    ],
  });
  assert.equal(insight.availability, "partial");
  assert.equal(insight.coverage.groups.workdays.available, 3);
  assert.equal(insight.coverage.groups.nonWorkdays.available, 3);
  assert.equal(insight.coverage.groups.workdays.legacyUnknown, 1);
});

test("explicit zero participates while confirmed missing is excluded", () => {
  const insight = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-11",
    metric: "steps",
    calendarOverrides: {},
    healthRecords: [
      health("2026-01-05", { steps: 0 }),
      health("2026-01-06", { steps: 999, metricCoverage: "[]" }),
      health("2026-01-10", { steps: 0 }),
      health("2026-01-11", { steps: 200 }),
    ],
  });
  assert.equal(insight.value.workdayAverage, 0);
  assert.equal(insight.value.workdayDays, 1);
  assert.equal(insight.coverage.groups.workdays.confirmedMissing, 1);
  assert.equal(insight.value.nonWorkdayAverage, 100);
});

test("legacy records preserve values but make Health insight partial", () => {
  const insight = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-11",
    metric: "steps",
    calendarOverrides: {},
    healthRecords: [
      health("2026-01-05", { steps: 100, metricCoverage: null }),
      health("2026-01-06", { steps: 300 }),
      health("2026-01-10", { steps: 500 }),
      health("2026-01-11", { steps: 700 }),
    ],
  });
  assert.equal(insight.availability, "partial");
  assert.equal(insight.value.workdayAverage, 200);
  assert.equal(insight.coverage.groups.workdays.legacyUnknown, 1);
  assert.ok(insight.coverage.reasons.includes("early-health-records"));
});

test("Calendar override controls the final workday group", () => {
  const insight = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-11",
    metric: "steps",
    calendarOverrides: { "2026-01-10": true },
    healthRecords: [
      health("2026-01-05", { steps: 100 }),
      health("2026-01-10", { steps: 300 }),
      health("2026-01-11", { steps: 700 }),
    ],
  });
  assert.equal(insight.value.workdayDays, 2);
  assert.equal(insight.value.nonWorkdayDays, 1);
});

test("Health insight excludes post-asOf records and rejects an unconfigured calendar", () => {
  const bounded = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-10",
    metric: "steps",
    calendarOverrides: {},
    healthRecords: [health("2026-01-05"), health("2026-01-10"), health("2026-01-11", { steps: 9999 })],
  });
  assert.equal(bounded.value.nonWorkdayAverage, 100);
  const unavailable = createHealthWorkdayInsight({
    year: 2025,
    asOfDate: "2025-01-10",
    metric: "steps",
    calendarOverrides: {},
    healthRecords: [health("2025-01-06"), health("2025-01-10")],
  });
  assert.equal(unavailable.availability, "unavailable");
  assert.equal(unavailable.value, null);
  assert.equal(unavailable.coverage.state, "not-comparable");
});

test("exercise uses its own coverage instead of steps coverage", () => {
  const insight = createHealthWorkdayInsight({
    year: 2026,
    asOfDate: "2026-01-11",
    metric: "exerciseMinutes",
    calendarOverrides: {},
    healthRecords: [
      health("2026-01-05", { exerciseMinutes: 999, metricCoverage: '["steps"]' }),
      health("2026-01-06", { exerciseMinutes: 0, metricCoverage: '["exerciseMinutes"]' }),
      health("2026-01-10", { exerciseMinutes: 20, metricCoverage: '["exerciseMinutes"]' }),
      health("2026-01-11", { exerciseMinutes: 40, metricCoverage: '["exerciseMinutes"]' }),
    ],
  });
  assert.equal(insight.coverage.groups.workdays.confirmedMissing, 1);
  assert.equal(insight.value.workdayAverage, 0);
  assert.equal(insight.value.nonWorkdayAverage, 30);
});

test("Finance cash flow uses the supplied accounting summary and preserves cutoff", () => {
  const insight = createFinanceCashFlowInsight(2026, "2026-08-22", financeSummary());
  assert.deepEqual(insight.value, { incomeCents: 1_000_000, netExpenseCents: 600_000, balanceCents: 400_000 });
  assert.equal(insight.availability, "partial");
  assert.equal(insight.coverage.cutoffDate, "2026-08-11");
  assert.ok(insight.coverage.reasons.includes("finance-cutoff-before-as-of"));
});

test("Finance cash flow supports zero income and unavailable empty records", () => {
  const zeroIncome = createFinanceCashFlowInsight(2026, "2026-08-11", financeSummary({ facts: { incomeCents: 0 } }));
  assert.equal(zeroIncome.value.balanceCents, -600_000);
  const empty = createFinanceCashFlowInsight(2026, "2026-08-22", financeSummary({
    facts: { recordCount: 0, dateStart: null, dateEnd: null, incomeCents: 0, netExpenseCents: 0 },
    coverage: { sourceCutoffDate: null },
  }));
  assert.equal(empty.availability, "unavailable");
  assert.equal(empty.value, null);
});

test("Salary trend distinguishes zero, one, and multiple saved snapshots", () => {
  const empty = createSalaryTrendInsight(2026, "2026-08-22", []);
  assert.equal(empty.availability, "unavailable");
  assert.equal(empty.value, null);
  const single = createSalaryTrendInsight(2026, "2026-08-22", [salary("2026-07", 1000)]);
  assert.equal(single.availability, "partial");
  assert.equal(single.value, null);
  const trend = createSalaryTrendInsight(2026, "2026-08-22", [
    salary("2026-08", 1300, 0),
    salary("2026-06", 900),
    salary("2026-07", 1000),
  ]);
  assert.equal(trend.availability, "available");
  assert.deepEqual(trend.value, {
    savedMonthCount: 3,
    firstMonth: "2026-06",
    latestMonth: "2026-08",
    firstNetSalary: 900,
    latestNetSalary: 1300,
    difference: 400,
  });
});

test("Phase 1 returns exactly four finite insights without confidence scoring", () => {
  const insights = generateLifeInsights({
    year: 2026,
    asOfDate: "2026-08-22",
    healthRecords: [health("2026-01-05"), health("2026-01-06"), health("2026-01-10"), health("2026-01-11")],
    calendarOverrides: {},
    salaryRecords: [salary("2026-07", 1000), salary("2026-08", 1200)],
    lifeFinance: financeSummary(),
  });
  assert.equal(insights.length, 4);
  const serialized = JSON.stringify(insights);
  assert.equal(serialized.includes("confidence"), false);
  assert.equal(serialized.includes("NaN"), false);
  assert.equal(serialized.includes("Infinity"), false);
  assert.deepEqual(insights.map((item) => item.id), [
    "health-workday-steps",
    "health-workday-exercise",
    "life-finance-cash-flow",
    "salary-snapshot-trend",
  ]);
});
