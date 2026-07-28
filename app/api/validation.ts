export type HealthPayload = {
  date?: string;
  steps?: number;
  activeEnergyKcal?: number;
  restingEnergyKcal?: number;
  exerciseMinutes?: number;
  workoutCount?: number;
  source?: string;
  metrics?: HealthMetric[];
  data?: { metrics?: HealthMetric[] };
};

type HealthMetric = {
  name?: string;
  units?: string;
  data?: Array<{ qty?: number; date?: string }>;
};

export function validMonth(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

export function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validSalaryRecord(payload: Record<string, unknown>) {
  return (
    validMonth(payload.month) &&
    typeof payload.workdays === "number" &&
    Number.isInteger(payload.workdays) &&
    payload.workdays >= 0 &&
    payload.workdays <= 31
  );
}

export function isValidHealthApiKey(configuredKey: unknown, suppliedKey: unknown) {
  return typeof configuredKey === "string" && configuredKey.length > 0 && suppliedKey === configuredKey;
}

function numberInRange(value: unknown, min: number, max: number) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

function dateOnly(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

export function normalizeHealthPayload(payload: HealthPayload) {
  const metrics = payload.data?.metrics ?? payload.metrics;
  if (!Array.isArray(metrics)) {
    const date = dateOnly(payload.date);
    return date
      ? [{
          date,
          steps: Math.round(numberInRange(payload.steps, 0, 200_000)),
          activeEnergyKcal: numberInRange(payload.activeEnergyKcal, 0, 20_000),
          restingEnergyKcal: numberInRange(payload.restingEnergyKcal, 0, 20_000),
          exerciseMinutes: numberInRange(payload.exerciseMinutes, 0, 1_440),
          workoutCount: Math.round(numberInRange(payload.workoutCount, 0, 100)),
          source: payload.source?.trim().slice(0, 64) || "apple-health",
        }]
      : [];
  }

  const days = new Map<string, {
    date: string;
    steps: number;
    activeEnergyKcal: number;
    restingEnergyKcal: number;
    exerciseMinutes: number;
    workoutCount: number;
    source: string;
  }>();
  const exerciseNames = new Set(["apple_exercise_time", "exercise_time", "apple_exercise_minutes"]);
  const restingEnergyNames = new Set(["basal_energy", "basal_energy_burned", "resting_energy", "resting_energy_burned"]);

  for (const metric of metrics) {
    const name = metric.name?.toLowerCase() ?? "";
    if (name !== "step_count" && name !== "active_energy" && !exerciseNames.has(name) && !restingEnergyNames.has(name)) continue;

    for (const point of metric.data ?? []) {
      const date = dateOnly(point.date);
      if (!date) continue;
      const day = days.get(date) ?? {
        date,
        steps: 0,
        activeEnergyKcal: 0,
        restingEnergyKcal: 0,
        exerciseMinutes: 0,
        workoutCount: 0,
        source: "health-auto-export",
      };
      const qty = numberInRange(point.qty, 0, 200_000);
      if (name === "step_count") day.steps += Math.round(qty);
      if (name === "active_energy") day.activeEnergyKcal += qty;
      if (restingEnergyNames.has(name)) day.restingEnergyKcal += qty;
      if (exerciseNames.has(name)) day.exerciseMinutes += metric.units?.toLowerCase().startsWith("hr") ? qty * 60 : qty;
      days.set(date, day);
    }
  }

  return [...days.values()];
}
