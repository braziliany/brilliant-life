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
