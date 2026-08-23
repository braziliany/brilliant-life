export type InsightAvailability = "available" | "partial" | "unavailable";

export type InsightCoverageState =
  | "complete"
  | "partial"
  | "insufficient"
  | "not-comparable";

export type InsightPeriod = {
  granularity: "year-to-date" | "date-range" | "month-range";
  year: number;
  start: string | null;
  end: string | null;
  asOf: string;
};

export type InsightCoverageGroup = {
  available: number;
  trusted: number;
  legacyUnknown: number;
  confirmedMissing: number;
};

export type InsightCoverage = {
  state: InsightCoverageState;
  unit: "days" | "months" | "records";
  expected: number | null;
  available: number;
  dateStart: string | null;
  dateEnd: string | null;
  cutoffDate: string | null;
  groups?: {
    workdays: InsightCoverageGroup;
    nonWorkdays: InsightCoverageGroup;
  };
  reasons: string[];
};

type InsightSource = {
  domain: "health" | "calendar" | "salary" | "life-finance";
  metric?: string;
};

type InsightBase = {
  id: string;
  kind: "difference" | "fact" | "availability";
  unit?: string;
  period: InsightPeriod;
  availability: InsightAvailability;
  coverage: InsightCoverage;
  explanation: string;
  sources: InsightSource[];
  valueType: "actual" | "saved-snapshot" | "estimated" | "derived";
};

export type HealthWorkdayInsight = InsightBase & {
  id: "health-workday-steps" | "health-workday-exercise";
  kind: "difference";
  value: null | {
    workdayAverage: number;
    nonWorkdayAverage: number;
    difference: number;
    workdayDays: number;
    nonWorkdayDays: number;
  };
};

export type FinanceCashFlowInsight = InsightBase & {
  id: "life-finance-cash-flow";
  kind: "fact";
  value: null | {
    incomeCents: number;
    netExpenseCents: number;
    balanceCents: number;
  };
};

export type SalaryTrendInsight = InsightBase & {
  id: "salary-snapshot-trend";
  kind: "availability";
  value: null | {
    savedMonthCount: number;
    firstMonth: string;
    latestMonth: string;
    firstNetSalary: number;
    latestNetSalary: number;
    difference: number;
  };
};

export type LifeInsight =
  | HealthWorkdayInsight
  | FinanceCashFlowInsight
  | SalaryTrendInsight;
