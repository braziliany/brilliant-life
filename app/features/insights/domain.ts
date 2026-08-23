import type { HealthDaily, SalaryRecord } from "../../page-view.types.ts";
import {
  getHolidayCalendar,
  resolveCalendarDay,
  type CalendarOverrides,
} from "../calendar/domain.ts";
import {
  resolveHealthMetricAvailability,
  type HealthCoverageMetric,
} from "../health/domain.ts";
import type {
  FinanceCashFlowInsight,
  HealthWorkdayInsight,
  InsightCoverageGroup,
  LifeInsight,
  SalaryTrendInsight,
} from "./types.ts";

const MIN_GROUP_DAYS = 3;

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const emptyGroup = (): InsightCoverageGroup => ({
  available: 0,
  trusted: 0,
  legacyUnknown: 0,
  confirmedMissing: 0,
});

type HealthCalendarInput = {
  year: number;
  asOfDate: string;
  metric: "steps" | "exerciseMinutes";
  healthRecords: HealthDaily[];
  calendarOverrides: CalendarOverrides;
};

export function createHealthWorkdayInsight({
  year,
  asOfDate,
  metric,
  healthRecords,
  calendarOverrides,
}: HealthCalendarInput): HealthWorkdayInsight {
  const id = metric === "steps" ? "health-workday-steps" : "health-workday-exercise";
  const unit = metric === "steps" ? "步" : "分钟";
  const label = metric === "steps" ? "步数" : "锻炼时间";
  const start = `${year}-01-01`;
  const end = asOfDate < `${year}-12-31` ? asOfDate : `${year}-12-31`;
  const configured = getHolidayCalendar(year).status === "configured";
  const workdays = emptyGroup();
  const nonWorkdays = emptyGroup();
  const values = { workdays: [] as number[], nonWorkdays: [] as number[] };

  if (configured) {
    const uniqueRecords = new Map(
      healthRecords
        .filter((record) => record.date >= start && record.date <= end)
        .map((record) => [record.date, record]),
    );
    for (const record of uniqueRecords.values()) {
      const availability = resolveHealthMetricAvailability(record, metric as HealthCoverageMetric);
      const [, monthText, dayText] = record.date.split("-");
      const resolved = resolveCalendarDay(year, Number(monthText) - 1, Number(dayText), calendarOverrides);
      const group = resolved.workday ? workdays : nonWorkdays;
      const groupValues = resolved.workday ? values.workdays : values.nonWorkdays;
      if (availability === "confirmed-missing") {
        group.confirmedMissing += 1;
        continue;
      }
      group.available += 1;
      if (availability === "trusted-present") group.trusted += 1;
      else group.legacyUnknown += 1;
      groupValues.push(record[metric]);
    }
  }

  const bothGroupsAvailable = values.workdays.length > 0 && values.nonWorkdays.length > 0;
  const hasLegacy = workdays.legacyUnknown + nonWorkdays.legacyUnknown > 0;
  const smallSample = workdays.available < MIN_GROUP_DAYS || nonWorkdays.available < MIN_GROUP_DAYS;
  const availability = !configured || !bothGroupsAvailable
    ? "unavailable" as const
    : hasLegacy || smallSample
      ? "partial" as const
      : "available" as const;
  const reasons = [
    ...(!configured ? ["calendar-unconfigured"] : []),
    ...(configured && !bothGroupsAvailable ? ["missing-comparison-group"] : []),
    ...(hasLegacy ? ["early-health-records"] : []),
    ...(bothGroupsAvailable && smallSample ? ["small-sample"] : []),
  ];
  const value = bothGroupsAvailable
    ? {
        workdayAverage: round(values.workdays.reduce((sum, item) => sum + item, 0) / values.workdays.length),
        nonWorkdayAverage: round(values.nonWorkdays.reduce((sum, item) => sum + item, 0) / values.nonWorkdays.length),
        difference: 0,
        workdayDays: values.workdays.length,
        nonWorkdayDays: values.nonWorkdays.length,
      }
    : null;
  if (value) value.difference = round(value.workdayAverage - value.nonWorkdayAverage);

  return {
    id,
    kind: "difference",
    value,
    unit,
    period: { granularity: "year-to-date", year, start, end, asOf: asOfDate },
    availability,
    coverage: {
      state: availability === "available" ? "complete" : availability === "partial" ? "partial" : !configured ? "not-comparable" : "insufficient",
      unit: "days",
      expected: null,
      available: workdays.available + nonWorkdays.available,
      dateStart: start,
      dateEnd: end,
      cutoffDate: end,
      groups: { workdays, nonWorkdays },
      reasons,
    },
    explanation: !configured
      ? `${year} 年工作日历尚未配置，暂不能比较${label}。`
      : !value
        ? `工作日或非工作日的${label}记录还不够，暂不能比较。`
        : hasLegacy
          ? `部分早期健康记录缺少指标级同步信息，当前结果仅作记录范围内的比较。`
          : smallSample
            ? `目前可比较的日期较少，当前结果仅作记录范围内的比较。`
            : `按截至日期内有${label}记录的工作日和非工作日分别计算。`,
    sources: [
      { domain: "health", metric },
      { domain: "calendar", metric: "workday" },
    ],
    valueType: "derived",
  };
}

type LifeFinanceSummary = {
  facts: {
    recordCount: number;
    dateStart: string | null;
    dateEnd: string | null;
    incomeCents: number;
    netExpenseCents: number;
  };
  coverage: {
    sourceCutoffDate: string | null;
    annualAsOfDate: string | null;
  };
};

export function createFinanceCashFlowInsight(year: number, asOfDate: string, summary: LifeFinanceSummary): FinanceCashFlowInsight {
  const hasRecords = summary.facts.recordCount > 0 && summary.facts.dateStart !== null && summary.facts.dateEnd !== null;
  const partial = hasRecords && summary.facts.dateEnd! < asOfDate;
  return {
    id: "life-finance-cash-flow",
    kind: "fact",
    value: hasRecords ? {
      incomeCents: summary.facts.incomeCents,
      netExpenseCents: summary.facts.netExpenseCents,
      balanceCents: summary.facts.incomeCents - summary.facts.netExpenseCents,
    } : null,
    unit: "元",
    period: {
      granularity: "date-range",
      year,
      start: summary.facts.dateStart,
      end: summary.facts.dateEnd,
      asOf: asOfDate,
    },
    availability: !hasRecords ? "unavailable" : partial ? "partial" : "available",
    coverage: {
      state: !hasRecords ? "insufficient" : partial ? "partial" : "complete",
      unit: "records",
      expected: null,
      available: summary.facts.recordCount,
      dateStart: summary.facts.dateStart,
      dateEnd: summary.facts.dateEnd,
      cutoffDate: summary.coverage.sourceCutoffDate,
      reasons: !hasRecords ? ["no-finance-records"] : partial ? ["finance-cutoff-before-as-of"] : [],
    },
    explanation: !hasRecords
      ? "今年还没有财务记录。"
      : partial
        ? `当前账单记录截至 ${summary.facts.dateEnd}，结余只反映这段记录范围。`
        : "账单记录中的收入减去净消费，得到当前记录范围内的现金流差额。",
    sources: [{ domain: "life-finance", metric: "income-minus-net-expense" }],
    valueType: "derived",
  };
}

export function createSalaryTrendInsight(year: number, asOfDate: string, salaryRecords: SalaryRecord[]): SalaryTrendInsight {
  const records = salaryRecords
    .filter((record) => record.month.startsWith(`${year}-`) && record.month <= asOfDate.slice(0, 7))
    .sort((a, b) => a.month.localeCompare(b.month));
  const first = records[0] ?? null;
  const latest = records.at(-1) ?? null;
  const enough = records.length >= 2 && first !== null && latest !== null;
  return {
    id: "salary-snapshot-trend",
    kind: "availability",
    value: enough ? {
      savedMonthCount: records.length,
      firstMonth: first.month,
      latestMonth: latest.month,
      firstNetSalary: first.netSalary,
      latestNetSalary: latest.netSalary,
      difference: round(latest.netSalary - first.netSalary),
    } : null,
    unit: "元",
    period: {
      granularity: "month-range",
      year,
      start: first?.month ?? null,
      end: latest?.month ?? null,
      asOf: asOfDate.slice(0, 7),
    },
    availability: records.length === 0 ? "unavailable" : records.length === 1 ? "partial" : "available",
    coverage: {
      state: records.length === 0 ? "insufficient" : records.length === 1 ? "partial" : "complete",
      unit: "months",
      expected: null,
      available: records.length,
      dateStart: first?.month ?? null,
      dateEnd: latest?.month ?? null,
      cutoffDate: latest?.month ?? null,
      reasons: records.length === 0 ? ["no-salary-snapshots"] : records.length === 1 ? ["single-salary-snapshot"] : [],
    },
    explanation: records.length === 0
      ? "今年还没有已保存的工资记录。"
      : records.length === 1
        ? "目前只有 1 个月工资记录，还不足以形成趋势。"
        : `已保存 ${records.length} 个月工资记录，变化只比较最早与最新的实发快照。`,
    sources: [{ domain: "salary", metric: "saved-net-salary" }],
    valueType: "saved-snapshot",
  };
}

type GenerateLifeInsightsInput = {
  year: number;
  asOfDate: string;
  healthRecords: HealthDaily[];
  calendarOverrides: CalendarOverrides;
  salaryRecords: SalaryRecord[];
  lifeFinance: LifeFinanceSummary;
};

export function generateLifeInsights(input: GenerateLifeInsightsInput): LifeInsight[] {
  return [
    createHealthWorkdayInsight({ ...input, metric: "steps" }),
    createHealthWorkdayInsight({ ...input, metric: "exerciseMinutes" }),
    createFinanceCashFlowInsight(input.year, input.asOfDate, input.lifeFinance),
    createSalaryTrendInsight(input.year, input.asOfDate, input.salaryRecords),
  ];
}
