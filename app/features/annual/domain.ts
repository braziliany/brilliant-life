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

function isDateInYear(date: string, year: number) {
  return date.startsWith(`${year}-`);
}

function average(values: number[]) {
  return values.length === 0
    ? null
    : round(values.reduce((total, value) => total + value, 0) / values.length);
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
  const sleepValues = records.flatMap((record) =>
    record.sleepMinutes === null ? [] : [record.sleepMinutes],
  );
  const weightRecords = records.filter(
    (record): record is HealthDaily & { weightKg: number } =>
      record.weightKg !== null,
  );
  const heartRateValues = records.flatMap((record) =>
    record.restingHeartRateBpm === null ? [] : [record.restingHeartRateBpm],
  );
  const expectedDays = daysInYear(year);
  const availableDays = records.length;
  const warnings: string[] = [];

  if (availableDays < expectedDays) warnings.push("missing-health-days");
  if (sleepValues.length === 0) warnings.push("missing-sleep-data");
  if (weightRecords.length === 0) warnings.push("missing-weight-data");
  if (heartRateValues.length === 0)
    warnings.push("missing-resting-heart-rate-data");

  return {
    facts: {
      availableDays,
      totalSteps: records.reduce((total, record) => total + record.steps, 0),
      averageSteps: average(records.map((record) => record.steps)),
      totalActiveEnergyKcal: round(
        records.reduce(
          (total, record) => total + record.activeEnergyKcal,
          0,
        ),
      ),
      averageActiveEnergyKcal: average(
        records.map((record) => record.activeEnergyKcal),
      ),
      totalExerciseMinutes: round(
        records.reduce(
          (total, record) => total + record.exerciseMinutes,
          0,
        ),
      ),
      exerciseDays: records.filter((record) => record.exerciseMinutes > 0).length,
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

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const { daysInMonth } = getCalendarMonthShape(year, monthIndex);
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
      if (resolved.personalOverride && overrides[dateKey]) personalWorkdays += 1;
      if (resolved.personalOverride && !overrides[dateKey]) personalRestDays += 1;
    }
  }

  return {
    facts: {
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
  const health = summarizeHealthYear(year, data.healthRecords);
  const time = summarizeCalendarYear(year, data.calendarData);
  const finance = summarizeSalaryYear(year, data.salaryRecords);
  const career = summarizeCareerYear(year, data.experiences);
  const summaries = [health, time, finance, career];

  return {
    year,
    generatedAt: data.generatedAt,
    calculationVersion: ANNUAL_SUMMARY_VERSION,
    status: "draft" as const,
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
  "missing-health-days": "该年度健康日记录不完整。",
  "missing-sleep-data": "该年度没有可用的睡眠记录。",
  "missing-weight-data": "该年度没有可用的体重记录。",
  "missing-resting-heart-rate-data": "该年度没有可用的静息心率记录。",
  "unconfigured-holiday-calendar": "该年度尚未配置官方节假日与调休规则。",
  "missing-salary-months": "该年度已保存的工资月份不足十二个月。",
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
