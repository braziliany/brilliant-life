import type { HealthDaily, HealthIngestionRun, HealthMetric } from "../../page-view.types";

export const healthCoverageMetrics = [
  "steps",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "exerciseMinutes",
  "workoutCount",
  "weightKg",
  "sleepMinutes",
  "restingHeartRateBpm",
] as const;

export type HealthCoverageMetric = typeof healthCoverageMetrics[number];
export type HealthMetricAvailability = "trusted-present" | "legacy-unknown" | "confirmed-missing";

export const getHealthMetricCoverage = (record: HealthDaily) => {
  if (record.metricCoverage === null || record.metricCoverage === undefined) return null;
  try {
    const parsed = JSON.parse(record.metricCoverage);
    if (!Array.isArray(parsed)) return null;
    return new Set<HealthCoverageMetric>(
      healthCoverageMetrics.filter((metric) => parsed.includes(metric)),
    );
  } catch {
    return null;
  }
};

export const resolveHealthMetricAvailability = (
  record: HealthDaily,
  metric: HealthCoverageMetric,
): HealthMetricAvailability => {
  const coverage = getHealthMetricCoverage(record);
  if (coverage === null) return "legacy-unknown";
  return coverage.has(metric) ? "trusted-present" : "confirmed-missing";
};

export const selectTodayHealth = (history: HealthDaily[], todayKey: string) =>
  history.find((item) => item.date === todayKey) ?? null;

export const toChronologicalHealthHistory = (history: HealthDaily[]) =>
  [...history].reverse();

export const calculateHealthSummary = (
  health: HealthDaily | null,
  stepGoal: number,
  metricKeys?: readonly string[],
) => {
  const hasMetric = (metric: string) => Boolean(health) && (metricKeys === undefined || metricKeys.includes(metric));
  const steps = hasMetric("steps") ? health!.steps : null;
  const activeEnergy = hasMetric("activeEnergyKcal") ? Math.round(health!.activeEnergyKcal) : null;
  const restingEnergy = hasMetric("restingEnergyKcal") ? health!.restingEnergyKcal : null;
  const exerciseMinutes = hasMetric("exerciseMinutes") ? health!.exerciseMinutes : null;

  return {
    steps,
    stepProgress: steps === null ? null : Math.min(100, Math.round((steps / stepGoal) * 100)),
    activeEnergy,
    totalEnergy: activeEnergy !== null && restingEnergy !== null
      ? Math.round(health!.activeEnergyKcal + restingEnergy)
      : null,
    exerciseHours: exerciseMinutes === null ? null : (exerciseMinutes / 60).toFixed(1),
  };
};

export const getHealthMetricValue = (item: HealthDaily, metric: HealthMetric) => {
  if (metric === "weightKg") return item.weightKg ?? 0;
  if (metric === "sleepMinutes") return (item.sleepMinutes ?? 0) / 60;
  if (metric === "restingHeartRateBpm") return item.restingHeartRateBpm ?? 0;
  return item[metric];
};

export const calculateHealthTrend = (
  history: HealthDaily[],
  period: 7 | 30,
  metric: HealthMetric,
) => {
  const visibleHistory = history.slice(-period);
  const metricHistory = metric === "weightKg" || metric === "sleepMinutes" || metric === "restingHeartRateBpm"
    ? visibleHistory.filter((item) => item[metric] !== null)
    : visibleHistory;
  const metricValues = metricHistory.map((item) => getHealthMetricValue(item, metric));
  const metricMax = Math.max(1, ...metricValues);
  const metricAverage = metricValues.length
    ? metricValues.reduce((sum, value) => sum + value, 0) / metricValues.length
    : 0;
  const metricAverageLabel = metric === "weightKg" || metric === "sleepMinutes"
    ? metricAverage.toFixed(1)
    : Math.round(metricAverage).toLocaleString("zh-CN");

  return {
    visibleHistory,
    metricHistory,
    metricMax,
    metricAverage,
    metricAverageLabel,
  };
};

export const calculateWeightTrend = (history: HealthDaily[]) => {
  const weightHistory = history.filter((item) => item.weightKg !== null);
  const recentWeightHistory = weightHistory.slice(-14);
  const latestWeight = weightHistory.at(-1)?.weightKg ?? null;
  const earliestRecentWeight = recentWeightHistory[0]?.weightKg ?? null;
  const weightChange = latestWeight !== null && earliestRecentWeight !== null && recentWeightHistory.length > 1
    ? latestWeight - earliestRecentWeight
    : null;
  const recentWeightValues = recentWeightHistory.map((item) => item.weightKg ?? 0);
  const recentWeightMin = Math.min(...recentWeightValues, latestWeight ?? 0);
  const recentWeightMax = Math.max(...recentWeightValues, latestWeight ?? 1);
  const recentWeightRange = Math.max(0.1, recentWeightMax - recentWeightMin);

  return {
    recentWeightHistory,
    latestWeight,
    weightChange,
    recentWeightMin,
    recentWeightRange,
  };
};

export type MissingTodayHealthMetric = "weightKg" | "sleepMinutes" | "restingHeartRateBpm";

export const getMissingTodayHealthMetrics = (health: HealthDaily | null): MissingTodayHealthMetric[] => {
  if (!health) return [];

  return [
    health.weightKg === null ? "weightKg" : null,
    health.sleepMinutes === null ? "sleepMinutes" : null,
    health.restingHeartRateBpm === null ? "restingHeartRateBpm" : null,
  ].filter((metric): metric is MissingTodayHealthMetric => metric !== null);
};

export const healthIngestionShanghaiDate = (receivedAt: string) => {
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const getRecentHealthDateKeys = (todayKey: string, days = 7) => {
  const [year, month, day] = todayKey.split("-").map(Number);
  if (!year || !month || !day || days <= 0) return [];
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - (days - index - 1)));
    return date.toISOString().slice(0, 10);
  });
};

export const calculateHealthIngestionContinuity = (
  ingestions: HealthIngestionRun[],
  todayKey: string,
  days = 7,
) => {
  const dateKeys = getRecentHealthDateKeys(todayKey, days);
  const receivedDates = new Set<string>();
  const successfulDates = new Set<string>();
  const failedDates = new Set<string>();

  for (const ingestion of ingestions) {
    const receivedDate = healthIngestionShanghaiDate(ingestion.receivedAt);
    if (!receivedDate || !dateKeys.includes(receivedDate)) continue;
    receivedDates.add(receivedDate);
    if (ingestion.status === "success") successfulDates.add(receivedDate);
    else failedDates.add(receivedDate);
  }

  return {
    dateKeys,
    receivedDateKeys: dateKeys.filter((date) => receivedDates.has(date)),
    successfulDateKeys: dateKeys.filter((date) => successfulDates.has(date)),
    failedDateKeys: dateKeys.filter((date) => failedDates.has(date)),
    missingDateKeys: dateKeys.filter((date) => !receivedDates.has(date)),
  };
};

export const findLatestSuccessfulIngestionForDate = (
  ingestions: HealthIngestionRun[],
  date: string,
) => ingestions.find((ingestion) => ingestion.status === "success" && ingestion.coveredDates.includes(date)) ?? null;

export const findLatestSuccessfulHealthIngestion = (ingestions: HealthIngestionRun[]) =>
  ingestions.find((ingestion) => ingestion.status === "success") ?? null;

export const getSuccessfulHealthMetricKeysForDate = (
  ingestions: HealthIngestionRun[],
  date: string,
) => [...new Set(ingestions
  .filter((ingestion) => ingestion.status === "success" && ingestion.coveredDates.includes(date))
  .flatMap((ingestion) => ingestion.metricKeys))];

export const getHealthMetricKeysForRecord = (health: HealthDaily | null) => {
  if (!health || health.metricCoverage === null || health.metricCoverage === undefined) return null;
  try {
    const parsed = JSON.parse(health.metricCoverage);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((key): key is string => typeof key === "string"))]
      : null;
  } catch {
    return null;
  }
};

export const resolveTodayHealthSync = (
  history: HealthDaily[],
  ingestions: HealthIngestionRun[],
  todayKey: string,
) => {
  const ingestion = findLatestSuccessfulIngestionForDate(ingestions, todayKey);
  const health = selectTodayHealth(history, todayKey);
  return {
    health,
    ingestion,
    synced: ingestion !== null,
    metricKeys: getHealthMetricKeysForRecord(health) ?? getSuccessfulHealthMetricKeysForDate(ingestions, todayKey),
    lastSuccessfulIngestion: findLatestSuccessfulHealthIngestion(ingestions),
  };
};

export const formatHealthSyncDateTime = (receivedAt?: string) => {
  if (!receivedAt) return "尚无记录";
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
};
