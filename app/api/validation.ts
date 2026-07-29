export type HealthPayload = {
  date?: string;
  steps?: number;
  activeEnergyKcal?: number;
  restingEnergyKcal?: number;
  exerciseMinutes?: number;
  workoutCount?: number;
  weightKg?: number;
  sleepMinutes?: number;
  source?: string;
  metrics?: HealthMetric[];
  data?: { metrics?: HealthMetric[] };
};

type HealthMetric = {
  name?: string;
  units?: string;
  data?: Array<{
    qty?: number;
    date?: string;
    startDate?: string;
    endDate?: string;
    value?: string;
    sleepStage?: string;
    totalSleep?: number;
    asleep?: number;
    core?: number;
    deep?: number;
    rem?: number;
    awake?: number;
    inBed?: number;
    sleepStart?: string;
    sleepEnd?: string;
  }>;
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

function weightInKg(value: unknown, units = "kg") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalizedUnits = units.toLowerCase();
  const kilograms = normalizedUnits.startsWith("lb")
    ? parsed * 0.45359237
    : normalizedUnits.startsWith("g") && !normalizedUnits.startsWith("kg")
      ? parsed / 1000
      : parsed;
  return kilograms >= 20 && kilograms <= 400 ? Math.round(kilograms * 1000) / 1000 : null;
}

function sleepDurationMinutes(point: NonNullable<HealthMetric["data"]>[number], units = "min") {
  const unitMultiplier = units.toLowerCase().startsWith("hr")
    ? 60
    : units.toLowerCase().startsWith("sec")
      ? 1 / 60
      : 1;
  const aggregatedTotal = Number(point.totalSleep ?? point.asleep);
  if (Number.isFinite(aggregatedTotal) && aggregatedTotal > 0) {
    return Math.min(1_440, aggregatedTotal * unitMultiplier);
  }
  const stageTotal = [point.core, point.deep, point.rem]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);
  if (stageTotal > 0) return Math.min(1_440, stageTotal * unitMultiplier);

  const start = Date.parse(point.startDate ?? "");
  const end = Date.parse(point.endDate ?? "");
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.min(1_440, (end - start) / 60_000);
  }

  const quantity = Number(point.qty);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const minutes = quantity * unitMultiplier;
  return Math.min(1_440, minutes);
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
          weightKg: weightInKg(payload.weightKg),
          sleepMinutes: payload.sleepMinutes == null ? null : numberInRange(payload.sleepMinutes, 0, 1_440),
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
    weightKg: number | null;
    sleepMinutes: number | null;
    source: string;
  }>();
  const exerciseNames = new Set(["apple_exercise_time", "exercise_time", "apple_exercise_minutes"]);
  const restingEnergyNames = new Set(["basal_energy", "basal_energy_burned", "resting_energy", "resting_energy_burned"]);
  const weightNames = new Set(["weight", "body_weight", "body_mass", "weight_body_mass"]);
  const sleepNames = new Set(["sleep", "sleep_analysis", "sleep_asleep", "sleep_core", "sleep_deep", "sleep_rem"]);

  for (const metric of metrics) {
    const name = metric.name?.toLowerCase() ?? "";
    if (name !== "step_count" && name !== "active_energy" && !exerciseNames.has(name) && !restingEnergyNames.has(name) && !weightNames.has(name) && !sleepNames.has(name)) continue;

    for (const point of metric.data ?? []) {
      const date = dateOnly(point.sleepEnd ?? point.endDate ?? point.date);
      if (!date) continue;
      const day = days.get(date) ?? {
        date,
        steps: 0,
        activeEnergyKcal: 0,
        restingEnergyKcal: 0,
        exerciseMinutes: 0,
        workoutCount: 0,
        weightKg: null,
        sleepMinutes: null,
        source: "health-auto-export",
      };
      const qty = numberInRange(point.qty, 0, 200_000);
      if (name === "step_count") day.steps += Math.round(qty);
      if (name === "active_energy") day.activeEnergyKcal += qty;
      if (restingEnergyNames.has(name)) day.restingEnergyKcal += qty;
      if (exerciseNames.has(name)) day.exerciseMinutes += metric.units?.toLowerCase().startsWith("hr") ? qty * 60 : qty;
      if (weightNames.has(name)) {
        day.weightKg = weightInKg(point.qty, metric.units);
      }
      if (sleepNames.has(name)) {
        const stage = (point.sleepStage ?? point.value ?? name).toLowerCase().replaceAll(/[\s_-]/g, "");
        if (!stage.includes("awake") && !stage.includes("inbed")) {
          const duration = sleepDurationMinutes(point, metric.units);
          if (duration > 0) day.sleepMinutes = (day.sleepMinutes ?? 0) + duration;
        }
      }
      days.set(date, day);
    }
  }

  return [...days.values()];
}
