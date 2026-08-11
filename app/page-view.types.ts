export type HealthDaily = {
  date: string;
  steps: number;
  activeEnergyKcal: number;
  restingEnergyKcal: number;
  exerciseMinutes: number;
  workoutCount: number;
  weightKg: number | null;
  sleepMinutes: number | null;
  restingHeartRateBpm: number | null;
  source: string;
  updatedAt: string;
};

export type HealthIngestionStatus = "success" | "no_supported_metrics" | "invalid_payload";

export type HealthIngestionRun = {
  id: number;
  receivedAt: string;
  coveredDates: string[];
  metricKeys: string[];
  importedDays: number;
  status: HealthIngestionStatus;
  source: string | null;
};

export type SalaryRecord = {
  month: string;
  workdays: number;
  dailyRate: number;
  grossSalary: number;
  deductions: number;
  taxThreshold: number;
  taxRate: number;
  taxableIncome: number;
  extraIncome: number;
  bonus: number;
  leaveDeduction: number;
  incomeTax: number;
  netSalary: number;
};

export type SalaryPolicy = {
  dailyRate: number;
  deductions: number;
  taxThreshold: number;
  taxRate: number;
  extraIncome: number;
  bonus: number;
  leaveDeduction: number;
};

export type WorkExperience = {
  id: number;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  summary: string;
};

export type WorkExperienceDraft = Omit<WorkExperience, "id">;

export type CalendarNote = {
  month: string;
  scheduleNote: string;
  leaveNote: string;
  overtimeNote: string;
};

export type ShanghaiDate = {
  year: number;
  month: number;
  day: number;
  weekday: string;
};

export type SitePage = "home" | "dashboard" | "annual";
export type HealthLoadStatus = "loading" | "ready" | "error";
export type HealthMetric = "steps" | "activeEnergyKcal" | "exerciseMinutes" | "weightKg" | "sleepMinutes" | "restingHeartRateBpm";

export type CalendarDayView = {
  key: string;
  day: number | null;
  className?: string;
  holiday?: string | null;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
};
