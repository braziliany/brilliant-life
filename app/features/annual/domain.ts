import type {
  HealthDaily,
  SalaryRecord,
  WorkExperience,
} from "../../page-view.types.ts";
import {
  getCalendarMonthShape,
  getHolidayCalendar,
  resolveCalendarDay,
  type CalendarOverrides,
} from "../calendar/domain.ts";

const ANNUAL_SUMMARY_VERSION = "annual-summary-v1";

export type AnnualCoverageState =
  | "unconfigured"
  | "no-records"
  | "partial"
  | "complete";

export type AnnualComparableMetric =
  | "health.totalSteps"
  | "health.averageSteps"
  | "health.totalActiveEnergyKcal"
  | "health.averageActiveEnergyKcal"
  | "health.totalExerciseMinutes"
  | "finance.totalGrossSalary"
  | "finance.totalIncomeTax"
  | "finance.totalNetSalary"
  | "time.officialWorkdays"
  | "time.actualWorkdays";

type DomainSummary<Facts, Coverage> = {
  facts: Facts;
  coverage: Coverage;
  sources: string[];
  warnings: string[];
};

type CalendarYearData = {
  overrides?: CalendarOverrides;
};

type AnnualSummaryInput = {
  generatedAt: string;
  asOfDate?: string;
  healthRecords: HealthDaily[];
  calendarData: CalendarYearData;
  salaryRecords: SalaryRecord[];
  experiences: WorkExperience[];
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function daysInYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function reportingPeriod(year: number, asOfDate: string) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const periodStatus =
    asOfDate < start
      ? "not-started" as const
      : asOfDate <= end
        ? "in-progress" as const
        : "complete" as const;
  const factThroughDate =
    periodStatus === "not-started"
      ? null
      : periodStatus === "complete"
        ? end
        : asOfDate;
  const factThroughMonth = factThroughDate?.slice(0, 7) ?? null;
  const expectedDays = factThroughDate
    ? Math.floor(
        (Date.parse(`${factThroughDate}T00:00:00Z`) -
          Date.parse(`${start}T00:00:00Z`)) /
          86_400_000,
      ) + 1
    : 0;
  const expectedMonths = factThroughMonth
    ? Number(factThroughMonth.slice(5, 7))
    : 0;
  return {
    periodStatus,
    asOfDate,
    factThroughDate,
    factThroughMonth,
    fullYearStart: start,
    fullYearEnd: end,
    expectedDays,
    expectedMonths,
  };
}

function isDateInYear(date: string, year: number) {
  return date.startsWith(`${year}-`);
}

function average(values: number[]) {
  return values.length === 0
    ? null
    : round(values.reduce((total, value) => total + value, 0) / values.length);
}

const annualHealthMetricKeys = [
  "steps",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "exerciseMinutes",
  "workoutCount",
  "weightKg",
  "sleepMinutes",
  "restingHeartRateBpm",
] as const;

type AnnualHealthMetricKey = typeof annualHealthMetricKeys[number];

function healthMetricCoverage(record: HealthDaily) {
  if (record.metricCoverage === null || record.metricCoverage === undefined) return null;
  try {
    const parsed = JSON.parse(record.metricCoverage);
    if (!Array.isArray(parsed)) return null;
    return new Set<AnnualHealthMetricKey>(
      annualHealthMetricKeys.filter((key) => parsed.includes(key)),
    );
  } catch {
    return null;
  }
}

function recordsWithHealthMetric(
  records: HealthDaily[],
  metric: AnnualHealthMetricKey,
) {
  return records.filter((record) => {
    const coverage = healthMetricCoverage(record);
    return coverage === null || coverage.has(metric);
  });
}

function trustedRecordsWithHealthMetric(
  records: HealthDaily[],
  metric: AnnualHealthMetricKey,
) {
  return records.filter((record) => healthMetricCoverage(record)?.has(metric));
}

export function getYearRange(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    days: daysInYear(year),
  };
}

export function summarizeHealthYear(
  year: number,
  healthRecords: HealthDaily[],
) {
  const recordsByDate = new Map<string, HealthDaily>();
  for (const record of healthRecords) {
    if (isDateInYear(record.date, year)) recordsByDate.set(record.date, record);
  }

  const records = [...recordsByDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const legacyUnknownRecords = records.filter((record) => healthMetricCoverage(record) === null);
  const trustedRecords = records.filter((record) => healthMetricCoverage(record) !== null);
  const trustedCoveredRecords = trustedRecords.filter((record) => healthMetricCoverage(record)!.size > 0);
  const confirmedMissingRecords = trustedRecords.filter((record) => healthMetricCoverage(record)!.size === 0);
  const coveredRecords = [...legacyUnknownRecords, ...trustedCoveredRecords];
  const stepRecords = recordsWithHealthMetric(records, "steps");
  const activeEnergyRecords = recordsWithHealthMetric(records, "activeEnergyKcal");
  const exerciseRecords = recordsWithHealthMetric(records, "exerciseMinutes");
  const trustedMetricAvailableDays = Object.fromEntries(
    annualHealthMetricKeys.map((metric) => [metric, trustedRecordsWithHealthMetric(records, metric).length]),
  ) as Record<AnnualHealthMetricKey, number>;
  const sleepValues = recordsWithHealthMetric(records, "sleepMinutes").flatMap((record) =>
    record.sleepMinutes === null ? [] : [record.sleepMinutes],
  );
  const weightRecords = recordsWithHealthMetric(records, "weightKg").filter(
    (record): record is HealthDaily & { weightKg: number } =>
      record.weightKg !== null,
  );
  const heartRateValues = recordsWithHealthMetric(records, "restingHeartRateBpm").flatMap((record) =>
    record.restingHeartRateBpm === null ? [] : [record.restingHeartRateBpm],
  );
  const expectedDays = daysInYear(year);
  const availableDays = coveredRecords.length;
  const months = Array.from({ length: 12 }, (_, monthIndex) => {
    const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const monthRecords = records.filter((record) => record.date.startsWith(month));
    const monthCoveredRecords = monthRecords.filter((record) => {
      const coverage = healthMetricCoverage(record);
      return coverage === null || coverage.size > 0;
    });
    const monthStepRecords = recordsWithHealthMetric(monthRecords, "steps");
    const monthActiveEnergyRecords = recordsWithHealthMetric(monthRecords, "activeEnergyKcal");
    const monthExerciseRecords = recordsWithHealthMetric(monthRecords, "exerciseMinutes");
    const monthSleep = recordsWithHealthMetric(monthRecords, "sleepMinutes").flatMap((record) =>
      record.sleepMinutes === null ? [] : [record.sleepMinutes],
    );
    return {
      month,
      availableDays: monthCoveredRecords.length,
      metricAvailableDays: {
        steps: monthStepRecords.length,
        activeEnergyKcal: monthActiveEnergyRecords.length,
        exerciseMinutes: monthExerciseRecords.length,
        sleepMinutes: monthSleep.length,
      },
      trustedMetricAvailableDays: {
        steps: trustedRecordsWithHealthMetric(monthRecords, "steps").length,
        activeEnergyKcal: trustedRecordsWithHealthMetric(monthRecords, "activeEnergyKcal").length,
        exerciseMinutes: trustedRecordsWithHealthMetric(monthRecords, "exerciseMinutes").length,
        sleepMinutes: trustedRecordsWithHealthMetric(monthRecords, "sleepMinutes").filter((record) => record.sleepMinutes !== null).length,
      },
      totalSteps: monthStepRecords.reduce((total, record) => total + record.steps, 0),
      activeEnergyKcal: round(
        monthActiveEnergyRecords.reduce((total, record) => total + record.activeEnergyKcal, 0),
      ),
      exerciseMinutes: round(
        monthExerciseRecords.reduce((total, record) => total + record.exerciseMinutes, 0),
      ),
      averageSleepMinutes: average(monthSleep),
    };
  });
  const warnings: string[] = [];

  if (availableDays < expectedDays) warnings.push("missing-health-days");
  if (legacyUnknownRecords.length > 0) {
    warnings.push("legacy-health-coverage-unknown");
  }
  if (sleepValues.length === 0) warnings.push("missing-sleep-data");
  if (weightRecords.length === 0) warnings.push("missing-weight-data");
  if (heartRateValues.length === 0)
    warnings.push("missing-resting-heart-rate-data");

  return {
    facts: {
      availableDays,
      metricAvailableDays: {
        steps: stepRecords.length,
        activeEnergyKcal: activeEnergyRecords.length,
        exerciseMinutes: exerciseRecords.length,
        sleepMinutes: sleepValues.length,
        weightKg: weightRecords.length,
        restingHeartRateBpm: heartRateValues.length,
      },
      trustedMetricAvailableDays,
      months,
      totalSteps: stepRecords.reduce((total, record) => total + record.steps, 0),
      averageSteps: average(stepRecords.map((record) => record.steps)),
      totalActiveEnergyKcal: round(
        activeEnergyRecords.reduce(
          (total, record) => total + record.activeEnergyKcal,
          0,
        ),
      ),
      averageActiveEnergyKcal: average(
        activeEnergyRecords.map((record) => record.activeEnergyKcal),
      ),
      totalExerciseMinutes: round(
        exerciseRecords.reduce(
          (total, record) => total + record.exerciseMinutes,
          0,
        ),
      ),
      exerciseDays: exerciseRecords.filter((record) => record.exerciseMinutes > 0).length,
      sleep: {
        availableDays: sleepValues.length,
        averageMinutes: average(sleepValues),
      },
      weight: {
        availableDays: weightRecords.length,
        firstKg: weightRecords[0]?.weightKg ?? null,
        lastKg: weightRecords.at(-1)?.weightKg ?? null,
        changeKg:
          weightRecords.length < 2
            ? null
            : round(
                weightRecords.at(-1)!.weightKg - weightRecords[0].weightKg,
              ),
      },
      restingHeartRate: {
        availableDays: heartRateValues.length,
        averageBpm: average(heartRateValues),
      },
    },
    coverage: {
      expectedDays,
      availableDays,
      ratio: round(availableDays / expectedDays, 4),
      trustedDays: trustedCoveredRecords.length,
      trustedRatio: round(trustedCoveredRecords.length / expectedDays, 4),
      legacyUnknownDays: legacyUnknownRecords.length,
      confirmedMissingDays: confirmedMissingRecords.length,
      trustState: legacyUnknownRecords.length > 0
        ? "legacy-unknown" as const
        : trustedCoveredRecords.length > 0
          ? "trusted" as const
          : "no-records" as const,
    },
    sources: ["health_daily"],
    warnings,
  } satisfies DomainSummary<Record<string, unknown>, Record<string, unknown>>;
}

export function summarizeCalendarYear(
  year: number,
  calendarData: CalendarYearData = {},
) {
  const overrides = calendarData.overrides ?? {};
  const holidayCalendar = getHolidayCalendar(year);
  const expectedDays = daysInYear(year);
  const officialCalendarConfigured = holidayCalendar.status === "configured";
  let officialWorkdays = 0;
  let actualWorkdays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  let makeupWorkdays = 0;
  let personalWorkdays = 0;
  let personalRestDays = 0;
  const months: Array<{
    month: string;
    workdays: number;
    restDays: number;
    holidayDays: number;
    makeupWorkdays: number;
    personalAdjustments: number;
  }> = [];

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const { daysInMonth } = getCalendarMonthShape(year, monthIndex);
    const monthFacts = {
      month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      workdays: 0,
      restDays: 0,
      holidayDays: 0,
      makeupWorkdays: 0,
      personalAdjustments: 0,
    };
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(Date.UTC(year, monthIndex, day));
      const resolved = resolveCalendarDay(year, monthIndex, day, overrides);
      const dateKey = resolved.date;
      const weekday = date.getUTCDay();

      if (weekday === 0 || weekday === 6) weekendDays += 1;
      if (resolved.holiday) holidayDays += 1;
      if (resolved.makeup) makeupWorkdays += 1;
      if (resolved.officialWorkday) officialWorkdays += 1;
      if (resolved.workday) actualWorkdays += 1;
      if (resolved.workday) monthFacts.workdays += 1;
      else monthFacts.restDays += 1;
      if (resolved.holiday) monthFacts.holidayDays += 1;
      if (resolved.makeup) monthFacts.makeupWorkdays += 1;
      if (resolved.personalOverride) monthFacts.personalAdjustments += 1;
      if (resolved.personalOverride && overrides[dateKey]) personalWorkdays += 1;
      if (resolved.personalOverride && !overrides[dateKey]) personalRestDays += 1;
    }
    months.push(monthFacts);
  }

  return {
    facts: {
      months,
      officialWorkdays,
      actualWorkdays,
      weekendDays,
      holidayDays,
      makeupWorkdays,
      personalAdjustments: personalWorkdays + personalRestDays,
      personalWorkdays,
      personalRestDays,
    },
    coverage: {
      expectedDays,
      availableDays: officialCalendarConfigured ? expectedDays : 0,
      ratio: officialCalendarConfigured ? 1 : 0,
      officialCalendarConfigured,
    },
    sources: officialCalendarConfigured
      ? [`holiday_calendar_${year}`, "calendar_overrides"]
      : ["calendar_overrides"],
    warnings: officialCalendarConfigured
      ? []
      : ["unconfigured-holiday-calendar"],
  } satisfies DomainSummary<Record<string, unknown>, Record<string, unknown>>;
}

export function summarizeSalaryYear(
  year: number,
  salaryRecords: SalaryRecord[],
) {
  const records = salaryRecords
    .filter((record) => record.month.startsWith(`${year}-`))
    .sort((a, b) => a.month.localeCompare(b.month));
  const savedMonths = records.map((record) => record.month);

  return {
    facts: {
      savedMonths,
      savedMonthCount: records.length,
      months: records.map((record) => ({
        month: record.month,
        workdays: record.workdays,
        grossSalary: record.grossSalary,
        incomeTax: record.incomeTax,
        netSalary: record.netSalary,
      })),
      totalGrossSalary: round(
        records.reduce((total, record) => total + record.grossSalary, 0),
      ),
      totalIncomeTax: round(
        records.reduce((total, record) => total + record.incomeTax, 0),
      ),
      totalNetSalary: round(
        records.reduce((total, record) => total + record.netSalary, 0),
      ),
    },
    coverage: {
      expectedMonths: 12,
      availableMonths: records.length,
      ratio: round(records.length / 12, 4),
    },
    sources: ["salary_records"],
    warnings: records.length < 12 ? ["missing-salary-months"] : [],
  } satisfies DomainSummary<Record<string, unknown>, Record<string, unknown>>;
}

function monthIndex(value: string) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthKey(index: number) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function summarizeCareerYear(
  year: number,
  experiences: WorkExperience[],
) {
  const yearStart = monthIndex(`${year}-01`);
  const yearEnd = monthIndex(`${year}-12`);
  const coveredMonthIndexes = new Set<number>();
  const stages = experiences
    .flatMap((experience) => {
      const start = Math.max(monthIndex(experience.startDate), yearStart);
      const end = Math.min(
        experience.endDate ? monthIndex(experience.endDate) : yearEnd,
        yearEnd,
      );
      if (start > end) return [];
      for (let index = start; index <= end; index += 1) {
        coveredMonthIndexes.add(index);
      }
      return [
        {
          id: experience.id,
          company: experience.company,
          role: experience.role,
          startMonth: monthKey(start),
          endMonth: monthKey(end),
          months: end - start + 1,
        },
      ];
    })
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth));
  const availableMonths = coveredMonthIndexes.size;
  const warnings: string[] = [];
  if (stages.length === 0) warnings.push("no-career-records");
  else if (availableMonths < 12) warnings.push("partial-career-year");

  return {
    facts: {
      stages,
      stageCount: stages.length,
      companies: [...new Set(stages.map((stage) => stage.company))],
      roles: [...new Set(stages.map((stage) => stage.role))],
      coveredMonths: [...coveredMonthIndexes].sort((a, b) => a - b).map(monthKey),
    },
    coverage: {
      expectedMonths: 12,
      availableMonths,
      ratio: round(availableMonths / 12, 4),
    },
    sources: ["work_experiences"],
    warnings,
  } satisfies DomainSummary<Record<string, unknown>, Record<string, unknown>>;
}

export function generateAnnualSummaryDraft(
  year: number,
  data: AnnualSummaryInput,
) {
  const asOfDate = data.asOfDate ?? data.generatedAt.slice(0, 10);
  const reporting = reportingPeriod(year, asOfDate);
  const healthBase = summarizeHealthYear(
    year,
    reporting.factThroughDate
      ? data.healthRecords.filter((record) => record.date <= reporting.factThroughDate!)
      : [],
  );
  const health = {
    ...healthBase,
    coverage: {
      ...healthBase.coverage,
      expectedDays: reporting.expectedDays,
      fullYearExpectedDays: daysInYear(year),
      ratio: reporting.expectedDays
        ? round(healthBase.coverage.availableDays / reporting.expectedDays, 4)
        : 0,
      scope: reporting.periodStatus === "complete" ? "full-year" as const : "year-to-date" as const,
      asOfDate: reporting.factThroughDate,
    },
    warnings: [
      ...(healthBase.coverage.availableDays < reporting.expectedDays
        ? ["missing-health-days"]
        : []),
      ...healthBase.warnings.filter((warning) => warning !== "missing-health-days"),
    ],
  };
  const timeBase = summarizeCalendarYear(year, data.calendarData);
  const time = {
    ...timeBase,
    coverage: {
      ...timeBase.coverage,
      fullYearExpectedDays: daysInYear(year),
      scope: "full-year-configured" as const,
      asOfDate: reporting.factThroughDate,
      includesFutureDates: reporting.periodStatus !== "complete",
    },
  };
  const financeBase = summarizeSalaryYear(
    year,
    reporting.factThroughMonth
      ? data.salaryRecords.filter((record) => record.month <= reporting.factThroughMonth!)
      : [],
  );
  const finance = {
    ...financeBase,
    coverage: {
      ...financeBase.coverage,
      expectedMonths: reporting.expectedMonths,
      fullYearExpectedMonths: 12,
      ratio: reporting.expectedMonths
        ? round(financeBase.coverage.availableMonths / reporting.expectedMonths, 4)
        : 0,
      scope: reporting.periodStatus === "complete" ? "full-year" as const : "year-to-date" as const,
      asOfMonth: reporting.factThroughMonth,
    },
    warnings: [
      ...(financeBase.coverage.availableMonths < reporting.expectedMonths
        ? ["missing-salary-months"]
        : []),
    ],
  };
  const careerInput = reporting.factThroughMonth
    ? data.experiences.map((experience) => ({
        ...experience,
        endDate:
          experience.endDate && experience.endDate < reporting.factThroughMonth!
            ? experience.endDate
            : reporting.factThroughMonth,
      }))
    : [];
  const careerBase = summarizeCareerYear(year, careerInput);
  const career = {
    ...careerBase,
    coverage: {
      ...careerBase.coverage,
      expectedMonths: reporting.expectedMonths,
      fullYearExpectedMonths: 12,
      ratio: reporting.expectedMonths
        ? round(careerBase.coverage.availableMonths / reporting.expectedMonths, 4)
        : 0,
      scope: reporting.periodStatus === "complete" ? "full-year" as const : "year-to-date" as const,
      asOfMonth: reporting.factThroughMonth,
    },
    warnings: careerBase.facts.stages.length === 0
      ? ["no-career-records"]
      : careerBase.coverage.availableMonths < reporting.expectedMonths
        ? ["partial-career-year"]
        : [],
  };
  const summaries = [health, time, finance, career];

  return {
    year,
    generatedAt: data.generatedAt,
    asOfDate,
    calculationVersion: ANNUAL_SUMMARY_VERSION,
    status: "draft" as const,
    periodStatus: reporting.periodStatus,
    reportingPeriod: reporting,
    completeness: {
      healthDaysRatio: health.coverage.ratio,
      calendarDaysRatio: time.coverage.ratio,
      salaryMonthsRatio: finance.coverage.ratio,
      careerMonthsRatio: career.coverage.ratio,
    },
    health,
    time,
    finance,
    career,
    sources: [...new Set(summaries.flatMap((summary) => summary.sources))],
    warnings: [...new Set(summaries.flatMap((summary) => summary.warnings))],
  };
}

export type AnnualSummaryDraft = ReturnType<typeof generateAnnualSummaryDraft>;

type AnnualDomain = AnnualSummaryDraft["health"];

const warningExplanations: Record<string, string> = {
  "missing-health-days": "截至统计日期，健康日记录尚未完整覆盖已发生日期。",
  "missing-sleep-data": "该年度没有可用的睡眠记录。",
  "missing-weight-data": "该年度没有可用的体重记录。",
  "missing-resting-heart-rate-data": "该年度没有可用的静息心率记录。",
  "legacy-health-coverage-unknown": "部分早期健康记录缺少指标级同步信息。",
  "unconfigured-holiday-calendar": "该年度尚未配置官方节假日与调休规则。",
  "missing-salary-months": "截至统计月份，已保存工资记录尚未覆盖全部已到月份。",
  "no-career-records": "该年度没有与之重叠的职业经历记录。",
  "partial-career-year": "该年度职业经历记录未覆盖全部月份。",
};

const sourceExplanations: Record<string, string> = {
  health_daily: "健康每日汇总记录",
  calendar_overrides: "个人工作日历修改",
  salary_records: "已保存的月度工资快照",
  work_experiences: "职业经历记录",
};

export function explainAnnualWarning(warning: string) {
  return warningExplanations[warning] ?? `未识别的年度警告：${warning}`;
}

export function explainAnnualSource(source: string) {
  if (source.startsWith("holiday_calendar_")) {
    return `${source.slice("holiday_calendar_".length)} 年官方节假日配置`;
  }
  return sourceExplanations[source] ?? `未识别的数据来源：${source}`;
}

function coverageValues(coverage: AnnualDomain["coverage"] | Record<string, unknown>) {
  const expected =
    typeof coverage.expectedDays === "number"
      ? coverage.expectedDays
      : typeof coverage.expectedMonths === "number"
        ? coverage.expectedMonths
        : 0;
  const available =
    typeof coverage.availableDays === "number"
      ? coverage.availableDays
      : typeof coverage.availableMonths === "number"
        ? coverage.availableMonths
        : 0;
  return { expected, available };
}

export function getAnnualCoverageState(
  coverage: Record<string, unknown>,
): AnnualCoverageState {
  if (coverage.officialCalendarConfigured === false) return "unconfigured";
  const { expected, available } = coverageValues(coverage);
  if (available === 0) return "no-records";
  if (expected > 0 && available >= expected) return "complete";
  return "partial";
}

export function explainAnnualDomain(
  domain: {
    coverage: Record<string, unknown>;
    sources: string[];
    warnings: string[];
  },
) {
  const state = getAnnualCoverageState(domain.coverage);
  const { expected, available } = coverageValues(domain.coverage);
  return {
    state,
    expected,
    available,
    ratio:
      typeof domain.coverage.ratio === "number" ? domain.coverage.ratio : 0,
    sources: domain.sources.map((source) => ({
      code: source,
      explanation: explainAnnualSource(source),
    })),
    warnings: domain.warnings.map((warning) => ({
      code: warning,
      explanation: explainAnnualWarning(warning),
    })),
  };
}

const comparableMetricDomains: Record<
  AnnualComparableMetric,
  "health" | "finance" | "time"
> = {
  "health.totalSteps": "health",
  "health.averageSteps": "health",
  "health.totalActiveEnergyKcal": "health",
  "health.averageActiveEnergyKcal": "health",
  "health.totalExerciseMinutes": "health",
  "finance.totalGrossSalary": "finance",
  "finance.totalIncomeTax": "finance",
  "finance.totalNetSalary": "finance",
  "time.officialWorkdays": "time",
  "time.actualWorkdays": "time",
};

function annualMetricValue(
  draft: AnnualSummaryDraft,
  metric: AnnualComparableMetric,
) {
  const [domainName, factName] = metric.split(".") as [
    "health" | "finance" | "time",
    string,
  ];
  const facts = draft[domainName].facts as Record<string, unknown>;
  const value = facts[factName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function compareAnnualMetric(
  metric: AnnualComparableMetric,
  current: AnnualSummaryDraft,
  baseline: AnnualSummaryDraft,
) {
  const domainName = comparableMetricDomains[metric];
  const currentState = getAnnualCoverageState(current[domainName].coverage);
  const baselineState = getAnnualCoverageState(baseline[domainName].coverage);
  const currentValue = annualMetricValue(current, metric);
  const baselineValue = annualMetricValue(baseline, metric);
  const reasons: string[] = [];

  if (current.year === baseline.year) reasons.push("same-year");
  if (currentState !== "complete") reasons.push("current-year-incomplete");
  if (baselineState !== "complete") reasons.push("baseline-year-incomplete");
  if (currentState === "complete" && current.periodStatus !== "complete")
    reasons.push("current-period-in-progress");
  if (baselineState === "complete" && baseline.periodStatus !== "complete")
    reasons.push("baseline-period-in-progress");
  if (currentValue === null) reasons.push("current-value-missing");
  if (baselineValue === null) reasons.push("baseline-value-missing");

  const comparable = reasons.length === 0;
  return {
    metric,
    comparable,
    currentYear: current.year,
    baselineYear: baseline.year,
    currentValue,
    baselineValue,
    difference:
      comparable && currentValue !== null && baselineValue !== null
        ? round(currentValue - baselineValue)
        : null,
    changeRatio:
      comparable &&
      currentValue !== null &&
      baselineValue !== null &&
      baselineValue !== 0
        ? round((currentValue - baselineValue) / baselineValue, 4)
        : null,
    reasons,
  };
}
