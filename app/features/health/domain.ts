import type { HealthDaily, HealthMetric } from "../../page-view.types";

export const selectTodayHealth = (history: HealthDaily[], todayKey: string) =>
  history.find((item) => item.date === todayKey) ?? null;

export const toChronologicalHealthHistory = (history: HealthDaily[]) =>
  [...history].reverse();

export const calculateHealthSummary = (health: HealthDaily | null, stepGoal: number) => {
  const steps = health?.steps ?? 0;

  return {
    steps,
    stepProgress: Math.min(100, Math.round((steps / stepGoal) * 100)),
    activeEnergy: Math.round(health?.activeEnergyKcal ?? 0),
    totalEnergy: health && health.restingEnergyKcal > 0
      ? Math.round(health.activeEnergyKcal + health.restingEnergyKcal)
      : null,
    exerciseHours: ((health?.exerciseMinutes ?? 0) / 60).toFixed(1),
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
