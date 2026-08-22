import assert from "node:assert/strict";
import test from "node:test";

import {
  compareAnnualMetric,
  explainAnnualDomain,
  explainAnnualSource,
  explainAnnualWarning,
  generateAnnualSummaryDraft,
  getAnnualCoverageState,
  getYearRange,
  summarizeCalendarYear,
  summarizeCareerYear,
  summarizeHealthYear,
  summarizeSalaryYear,
} from "../app/features/annual/domain.ts";

const completeHealthCoverage = JSON.stringify([
  "steps",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "exerciseMinutes",
  "workoutCount",
  "weightKg",
  "sleepMinutes",
  "restingHeartRateBpm",
]);

const healthRecord = (date, overrides = {}) => ({
  date,
  steps: 0,
  activeEnergyKcal: 0,
  restingEnergyKcal: 0,
  exerciseMinutes: 0,
  workoutCount: 0,
  weightKg: null,
  sleepMinutes: null,
  restingHeartRateBpm: null,
  metricCoverage: completeHealthCoverage,
  source: "health-auto-export",
  updatedAt: `${date}T12:00:00.000Z`,
  ...overrides,
});

const salaryRecord = (month, overrides = {}) => ({
  month,
  workdays: 0,
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
  netSalary: 0,
  ...overrides,
});

const yearDates = (year) => {
  const dates = [];
  for (
    let date = new Date(Date.UTC(year, 0, 1));
    date.getUTCFullYear() === year;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
};

test("getYearRange returns exact normal-year and leap-year boundaries", () => {
  assert.deepEqual(getYearRange(2026), {
    start: "2026-01-01",
    end: "2026-12-31",
    days: 365,
  });
  assert.deepEqual(getYearRange(2024), {
    start: "2024-01-01",
    end: "2024-12-31",
    days: 366,
  });
});

test("summarizeHealthYear recognizes complete coverage without treating zero as missing", () => {
  const records = yearDates(2026).map((date) => healthRecord(date));
  const summary = summarizeHealthYear(2026, records);

  assert.equal(summary.coverage.expectedDays, 365);
  assert.equal(summary.coverage.availableDays, 365);
  assert.equal(summary.coverage.ratio, 1);
  assert.equal(summary.facts.totalSteps, 0);
  assert.equal(summary.facts.averageSteps, 0);
  assert.equal(summary.facts.totalActiveEnergyKcal, 0);
  assert.ok(!summary.warnings.includes("missing-health-days"));
});

test("summarizeHealthYear preserves partial data, optional nulls, and metric facts", () => {
  const summary = summarizeHealthYear(2026, [
    healthRecord("2025-12-31", { steps: 99999 }),
    healthRecord("2026-01-01", {
      steps: 0,
      activeEnergyKcal: 0,
      exerciseMinutes: 0,
      sleepMinutes: null,
      weightKg: 70,
      restingHeartRateBpm: 80,
    }),
    healthRecord("2026-12-31", {
      steps: 10000,
      activeEnergyKcal: 500.25,
      exerciseMinutes: 30,
      sleepMinutes: 420,
      weightKg: 68.5,
      restingHeartRateBpm: 70,
    }),
  ]);

  assert.equal(summary.coverage.availableDays, 2);
  assert.equal(summary.facts.totalSteps, 10000);
  assert.equal(summary.facts.months[0].availableDays, 1);
  assert.equal(summary.facts.months[0].totalSteps, 0);
  assert.equal(summary.facts.months[1].availableDays, 0);
  assert.equal(summary.facts.months[1].averageSleepMinutes, null);
  assert.equal(summary.facts.months[11].totalSteps, 10000);
  assert.equal(summary.facts.averageSteps, 5000);
  assert.equal(summary.facts.exerciseDays, 1);
  assert.deepEqual(summary.facts.sleep, {
    availableDays: 1,
    averageMinutes: 420,
  });
  assert.deepEqual(summary.facts.weight, {
    availableDays: 2,
    firstKg: 70,
    lastKg: 68.5,
    changeKg: -1.5,
  });
  assert.equal(summary.facts.restingHeartRate.averageBpm, 75);
  assert.ok(summary.warnings.includes("missing-health-days"));
});

test("summarizeHealthYear returns explicit missing-state facts for an empty year", () => {
  const summary = summarizeHealthYear(2026, []);
  assert.equal(summary.coverage.availableDays, 0);
  assert.equal(summary.facts.averageSteps, null);
  assert.equal(summary.facts.sleep.averageMinutes, null);
  assert.equal(summary.facts.weight.firstKg, null);
  assert.equal(summary.facts.restingHeartRate.averageBpm, null);
  assert.deepEqual(summary.warnings, [
    "missing-health-days",
    "missing-sleep-data",
    "missing-weight-data",
    "missing-resting-heart-rate-data",
  ]);
});

test("annual health keeps legacy values, excludes confirmed missing, and retains explicit zero", () => {
  const summary = summarizeHealthYear(2026, [
    healthRecord("2026-01-01", { steps: 10000, metricCoverage: '["steps"]' }),
    healthRecord("2026-01-02", { steps: 99999, metricCoverage: "[]" }),
    healthRecord("2026-01-03", { steps: 0, metricCoverage: '["steps"]' }),
    healthRecord("2026-01-04", { steps: 88888, metricCoverage: null }),
  ]);

  assert.equal(summary.coverage.availableDays, 3);
  assert.equal(summary.coverage.trustedDays, 2);
  assert.equal(summary.coverage.legacyUnknownDays, 1);
  assert.equal(summary.coverage.confirmedMissingDays, 1);
  assert.equal(summary.coverage.trustState, "legacy-unknown");
  assert.equal(summary.facts.metricAvailableDays.steps, 3);
  assert.equal(summary.facts.trustedMetricAvailableDays.steps, 2);
  assert.equal(summary.facts.totalSteps, 98888);
  assert.equal(summary.facts.averageSteps, 32962.67);
  assert.ok(summary.warnings.includes("legacy-health-coverage-unknown"));
});

test("legacy annual rows preserve the pre-migration page facts without becoming trusted coverage", () => {
  const summary = summarizeHealthYear(2026, yearDates(2026).map((date) =>
    healthRecord(date, { steps: 1234, metricCoverage: null })
  ));

  assert.equal(summary.coverage.availableDays, 365);
  assert.equal(summary.coverage.ratio, 1);
  assert.equal(summary.coverage.trustedDays, 0);
  assert.equal(summary.coverage.trustedRatio, 0);
  assert.equal(summary.coverage.legacyUnknownDays, 365);
  assert.equal(summary.coverage.trustState, "legacy-unknown");
  assert.equal(summary.facts.totalSteps, 365 * 1234);
  assert.equal(summary.facts.averageSteps, 1234);
  assert.equal(summary.facts.trustedMetricAvailableDays.steps, 0);
  assert.ok(summary.warnings.includes("legacy-health-coverage-unknown"));
});

test("summarizeCalendarYear preserves the configured 2026 official facts", () => {
  const summary = summarizeCalendarYear(2026, { overrides: {} });
  assert.equal(summary.coverage.officialCalendarConfigured, true);
  assert.equal(summary.coverage.ratio, 1);
  assert.equal(summary.facts.officialWorkdays, 248);
  assert.equal(summary.facts.actualWorkdays, 248);
  assert.equal(summary.facts.holidayDays, 33);
  assert.equal(summary.facts.makeupWorkdays, 6);
  assert.equal(summary.facts.weekendDays, 104);
  assert.equal(summary.facts.months.length, 12);
  assert.equal(summary.facts.months[6].workdays, 23);
  assert.equal(summary.facts.months[6].restDays, 8);
  assert.deepEqual(summary.warnings, []);
});

test("summarizeCalendarYear applies personal overrides without rewriting official facts", () => {
  const summary = summarizeCalendarYear(2026, {
    overrides: { "2026-07-04": true, "2026-07-06": false },
  });
  assert.equal(summary.facts.officialWorkdays, 248);
  assert.equal(summary.facts.actualWorkdays, 248);
  assert.equal(summary.facts.personalAdjustments, 2);
  assert.equal(summary.facts.personalWorkdays, 1);
  assert.equal(summary.facts.personalRestDays, 1);
});

test("summarizeCalendarYear marks unconfigured years instead of inventing official coverage", () => {
  const summary = summarizeCalendarYear(2027, { overrides: {} });
  assert.equal(summary.coverage.officialCalendarConfigured, false);
  assert.equal(summary.coverage.availableDays, 0);
  assert.equal(summary.coverage.ratio, 0);
  assert.deepEqual(summary.warnings, ["unconfigured-holiday-calendar"]);
});

test("summarizeSalaryYear aggregates saved snapshots and never recomputes July 2026", () => {
  const july = salaryRecord("2026-07", {
    workdays: 23,
    dailyRate: 1,
    grossSalary: 6325,
    deductions: 130,
    taxThreshold: 5000,
    taxRate: 99,
    taxableIncome: 1195,
    incomeTax: 35.85,
    netSalary: 6159.15,
  });
  const summary = summarizeSalaryYear(2026, [
    salaryRecord("2025-12", { netSalary: 99999 }),
    july,
    salaryRecord("2026-08", {
      grossSalary: 1000.1,
      incomeTax: 10.05,
      netSalary: 900.05,
    }),
  ]);

  assert.deepEqual(summary.facts.savedMonths, ["2026-07", "2026-08"]);
  assert.deepEqual(summary.facts.months.map((month) => month.month), ["2026-07", "2026-08"]);
  assert.equal(summary.facts.months[0].netSalary, 6159.15);
  assert.equal(summary.facts.totalGrossSalary, 7325.1);
  assert.equal(summary.facts.totalIncomeTax, 45.9);
  assert.equal(summary.facts.totalNetSalary, 7059.2);
  assert.equal(summarizeSalaryYear(2026, [july]).facts.totalNetSalary, 6159.15);
  assert.equal(summary.coverage.availableMonths, 2);
  assert.deepEqual(summary.warnings, ["missing-salary-months"]);
});

test("summarizeSalaryYear exposes an empty saved-history year without estimates", () => {
  const summary = summarizeSalaryYear(2026, []);
  assert.equal(summary.facts.totalNetSalary, 0);
  assert.equal(summary.coverage.availableMonths, 0);
  assert.deepEqual(summary.warnings, ["missing-salary-months"]);
});

test("summarizeCareerYear clips single-year and cross-year stages to the requested year", () => {
  const summary = summarizeCareerYear(2026, [
    {
      id: 1,
      company: "甲公司",
      role: "操作工",
      startDate: "2025-06",
      endDate: "2027-03",
      summary: "跨年经历",
    },
    {
      id: 2,
      company: "乙公司",
      role: "临时工",
      startDate: "2026-05",
      endDate: "2026-08",
      summary: "年内经历",
    },
  ]);

  assert.deepEqual(summary.facts.stages[0], {
    id: 1,
    company: "甲公司",
    role: "操作工",
    startMonth: "2026-01",
    endMonth: "2026-12",
    months: 12,
  });
  assert.equal(summary.facts.stages[1].months, 4);
  assert.equal(summary.coverage.availableMonths, 12);
  assert.equal(summary.coverage.ratio, 1);
  assert.deepEqual(summary.warnings, []);
});

test("summarizeCareerYear reports an empty year without career inference", () => {
  const summary = summarizeCareerYear(2026, []);
  assert.deepEqual(summary.facts.stages, []);
  assert.equal(summary.coverage.availableMonths, 0);
  assert.deepEqual(summary.warnings, ["no-career-records"]);
});

test("generateAnnualSummaryDraft composes four factual domains with caller time", () => {
  const input = {
    generatedAt: "2027-01-01T00:00:00.000Z",
    healthRecords: [healthRecord("2026-07-29", { steps: 17381 })],
    calendarData: { overrides: {} },
    salaryRecords: [salaryRecord("2026-07", { netSalary: 6159.15 })],
    experiences: [
      {
        id: 3,
        company: "博士电动工具（杭州）有限公司",
        role: "普工",
        startDate: "2024-02",
        endDate: null,
        summary: "仓库搬运工，临时工",
      },
    ],
  };
  const before = structuredClone(input);
  const draft = generateAnnualSummaryDraft(2026, input);

  assert.equal(draft.year, 2026);
  assert.equal(draft.generatedAt, input.generatedAt);
  assert.equal(draft.calculationVersion, "annual-summary-v1");
  assert.equal(draft.status, "draft");
  assert.equal(draft.asOfDate, "2027-01-01");
  assert.equal(draft.periodStatus, "complete");
  assert.equal(draft.health.facts.totalSteps, 17381);
  assert.equal(draft.time.facts.officialWorkdays, 248);
  assert.equal(draft.finance.facts.totalNetSalary, 6159.15);
  assert.equal(draft.career.coverage.ratio, 1);
  assert.deepEqual(draft.sources, [
    "health_daily",
    "holiday_calendar_2026",
    "calendar_overrides",
    "salary_records",
    "work_experiences",
  ]);
  assert.deepEqual(input, before);
});

test("annual draft marks an unfinished current year without using system time", () => {
  const draft = generateAnnualSummaryDraft(2026, {
    generatedAt: "2026-08-09T02:00:00.000Z",
    asOfDate: "2026-08-09",
    healthRecords: [],
    calendarData: { overrides: {} },
    salaryRecords: [],
    experiences: [],
  });
  assert.equal(draft.periodStatus, "in-progress");
  assert.equal(draft.asOfDate, "2026-08-09");
  assert.equal(draft.reportingPeriod.factThroughDate, "2026-08-09");
  assert.equal(draft.reportingPeriod.expectedDays, 221);
  assert.equal(draft.reportingPeriod.expectedMonths, 8);
  assert.deepEqual(draft.health.coverage, {
    expectedDays: 221,
    availableDays: 0,
    ratio: 0,
    trustedDays: 0,
    trustedRatio: 0,
    legacyUnknownDays: 0,
    confirmedMissingDays: 0,
    trustState: "no-records",
    fullYearExpectedDays: 365,
    scope: "year-to-date",
    asOfDate: "2026-08-09",
  });
  assert.equal(draft.finance.coverage.expectedMonths, 8);
  assert.equal(draft.finance.coverage.fullYearExpectedMonths, 12);
  assert.equal(draft.finance.coverage.scope, "year-to-date");
  assert.equal(draft.time.coverage.scope, "full-year-configured");
  assert.equal(draft.time.coverage.includesFutureDates, true);
  assert.equal(draft.time.coverage.expectedDays, 365);
  assert.equal(draft.completeness.healthDaysRatio, 0);
  assert.equal(draft.completeness.salaryMonthsRatio, 0);
});

test("current-year facts exclude records after asOf while calendar retains the configured full year", () => {
  const draft = generateAnnualSummaryDraft(2026, {
    generatedAt: "2026-08-09T02:00:00.000Z",
    asOfDate: "2026-08-09",
    healthRecords: [
      healthRecord("2026-08-09", { steps: 100 }),
      healthRecord("2026-08-10", { steps: 900 }),
    ],
    calendarData: { overrides: {} },
    salaryRecords: [
      salaryRecord("2026-08", { netSalary: 1000 }),
      salaryRecord("2026-09", { netSalary: 9000 }),
    ],
    experiences: [],
  });

  assert.equal(draft.health.facts.totalSteps, 100);
  assert.equal(draft.health.coverage.availableDays, 1);
  assert.equal(draft.finance.facts.totalNetSalary, 1000);
  assert.deepEqual(draft.finance.facts.savedMonths, ["2026-08"]);
  assert.equal(draft.time.facts.officialWorkdays, 248);
  assert.equal(draft.time.coverage.includesFutureDates, true);
});

test("coverage states distinguish unconfigured, no records, partial records, and complete zero facts", () => {
  assert.equal(
    getAnnualCoverageState({
      expectedDays: 365,
      availableDays: 0,
      ratio: 0,
      officialCalendarConfigured: false,
    }),
    "unconfigured",
  );
  assert.equal(
    getAnnualCoverageState({ expectedDays: 365, availableDays: 0, ratio: 0 }),
    "no-records",
  );
  assert.equal(
    getAnnualCoverageState({ expectedDays: 365, availableDays: 1, ratio: 0.0027 }),
    "partial",
  );
  assert.equal(
    getAnnualCoverageState({ expectedDays: 365, availableDays: 365, ratio: 1 }),
    "complete",
  );

  const completeZero = summarizeHealthYear(
    2026,
    yearDates(2026).map((date) => healthRecord(date)),
  );
  assert.equal(explainAnnualDomain(completeZero).state, "complete");
  assert.equal(completeZero.facts.totalSteps, 0);
});

test("trust explanations preserve stable source and warning codes", () => {
  assert.equal(explainAnnualSource("health_daily"), "健康每日汇总记录");
  assert.equal(
    explainAnnualSource("holiday_calendar_2026"),
    "2026 年官方节假日配置",
  );
  assert.equal(
    explainAnnualWarning("missing-salary-months"),
    "截至统计月份，已保存工资记录尚未覆盖全部已到月份。",
  );

  const explanation = explainAnnualDomain(summarizeSalaryYear(2026, []));
  assert.equal(explanation.state, "no-records");
  assert.equal(explanation.expected, 12);
  assert.equal(explanation.available, 0);
  assert.deepEqual(explanation.sources[0], {
    code: "salary_records",
    explanation: "已保存的月度工资快照",
  });
  assert.equal(explanation.warnings[0].code, "missing-salary-months");
});

const completeAnnualDraft = (year, { steps = 0, netSalary = 0 } = {}) =>
  generateAnnualSummaryDraft(year, {
    generatedAt: `${year + 1}-01-01T00:00:00.000Z`,
    healthRecords: yearDates(year).map((date) =>
      healthRecord(date, { steps }),
    ),
    calendarData: { overrides: {} },
    salaryRecords: Array.from({ length: 12 }, (_, index) =>
      salaryRecord(`${year}-${String(index + 1).padStart(2, "0")}`, {
        netSalary,
      }),
    ),
    experiences: [],
  });

test("annual comparisons allow only whitelisted metrics with complete domain coverage", () => {
  const baseline = completeAnnualDraft(2025, { steps: 0, netSalary: 5000 });
  const current = completeAnnualDraft(2026, { steps: 10, netSalary: 6000 });

  const healthComparison = compareAnnualMetric(
    "health.totalSteps",
    current,
    baseline,
  );
  assert.equal(healthComparison.comparable, true);
  assert.equal(healthComparison.currentValue, 3650);
  assert.equal(healthComparison.baselineValue, 0);
  assert.equal(healthComparison.difference, 3650);
  assert.equal(healthComparison.changeRatio, null);
  assert.deepEqual(healthComparison.reasons, []);

  const salaryComparison = compareAnnualMetric(
    "finance.totalNetSalary",
    current,
    baseline,
  );
  assert.equal(salaryComparison.comparable, true);
  assert.equal(salaryComparison.difference, 12000);
  assert.equal(salaryComparison.changeRatio, 0.2);
});

test("annual comparisons refuse partial coverage and same-year comparisons", () => {
  const baseline = completeAnnualDraft(2025, { steps: 10 });
  const partial = generateAnnualSummaryDraft(2026, {
    generatedAt: "2026-08-09T00:00:00.000Z",
    healthRecords: [healthRecord("2026-08-09", { steps: 10 })],
    calendarData: { overrides: {} },
    salaryRecords: [],
    experiences: [],
  });
  const incomplete = compareAnnualMetric(
    "health.totalSteps",
    partial,
    baseline,
  );
  assert.equal(incomplete.comparable, false);
  assert.equal(incomplete.difference, null);
  assert.deepEqual(incomplete.reasons, ["current-year-incomplete"]);

  const sameYear = compareAnnualMetric(
    "health.totalSteps",
    baseline,
    baseline,
  );
  assert.equal(sameYear.comparable, false);
  assert.deepEqual(sameYear.reasons, ["same-year"]);
});

test("complete YTD coverage does not masquerade as a comparable completed year", () => {
  const baseline = completeAnnualDraft(2025, { steps: 10 });
  const ytdDates = yearDates(2026).filter((date) => date <= "2026-08-09");
  const current = generateAnnualSummaryDraft(2026, {
    generatedAt: "2026-08-09T00:00:00.000Z",
    asOfDate: "2026-08-09",
    healthRecords: ytdDates.map((date) => healthRecord(date, { steps: 10 })),
    calendarData: { overrides: {} },
    salaryRecords: [],
    experiences: [],
  });

  assert.equal(getAnnualCoverageState(current.health.coverage), "complete");
  const comparison = compareAnnualMetric("health.totalSteps", current, baseline);
  assert.equal(comparison.comparable, false);
  assert.deepEqual(comparison.reasons, ["current-period-in-progress"]);
});
