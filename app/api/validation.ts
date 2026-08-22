export type HealthPayload = {
  date?: string;
  steps?: unknown;
  activeEnergyKcal?: unknown;
  restingEnergyKcal?: unknown;
  exerciseMinutes?: unknown;
  workoutCount?: unknown;
  weightKg?: unknown;
  sleepMinutes?: unknown;
  restingHeartRateBpm?: unknown;
  source?: string;
  metrics?: HealthMetric[];
  workouts?: HealthWorkout[];
  data?: { metrics?: HealthMetric[]; workouts?: HealthWorkout[] };
};

type HealthWorkout = {
  date?: string;
  startDate?: string;
  endDate?: string;
};

type HealthMetric = {
  name?: string;
  units?: string;
  data?: Array<{
    qty?: unknown;
    date?: string;
    startDate?: string;
    endDate?: string;
    value?: string;
    sleepStage?: string;
    totalSleep?: unknown;
    asleep?: unknown;
    core?: unknown;
    deep?: unknown;
    rem?: unknown;
    awake?: unknown;
    inBed?: unknown;
    sleepStart?: string;
    sleepEnd?: string;
  }>;
};

export type HealthMetricKey =
  | "steps"
  | "activeEnergyKcal"
  | "restingEnergyKcal"
  | "exerciseMinutes"
  | "workoutCount"
  | "weightKg"
  | "sleepMinutes"
  | "restingHeartRateBpm";

export type NormalizedHealthRow = {
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
};

export type NormalizedHealthIngestion = {
  rows: NormalizedHealthRow[];
  coverage: Record<string, HealthMetricKey[]>;
};

const healthMetricKeys: readonly HealthMetricKey[] = [
  "steps",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "exerciseMinutes",
  "workoutCount",
  "weightKg",
  "sleepMinutes",
  "restingHeartRateBpm",
];

export function parseHealthMetricCoverage(value: unknown): HealthMetricKey[] | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return null;
    return healthMetricKeys.filter((key) => parsed.includes(key));
  } catch {
    return null;
  }
}

export function mergeHealthMetricCoverage(
  existing: unknown,
  incoming: readonly HealthMetricKey[],
) {
  const previous = parseHealthMetricCoverage(existing) ?? [];
  const present = new Set<HealthMetricKey>([...previous, ...incoming]);
  return healthMetricKeys.filter((key) => present.has(key));
}

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

export function currentShanghaiMonth(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export function isCurrentSalaryMonth(month: unknown, value = new Date()) {
  return validMonth(month) && month === currentShanghaiMonth(value);
}

export function isValidHealthApiKey(configuredKey: unknown, suppliedKey: unknown) {
  return typeof configuredKey === "string" && configuredKey.length > 0 && suppliedKey === configuredKey;
}

export type OptionalNumberResult =
  | { present: true; value: number }
  | { present: false; value: null };

export function parseOptionalNumber(value: unknown): OptionalNumberResult {
  if (value === undefined || value === null) return { present: false, value: null };
  if (typeof value === "string" && value.trim() === "") return { present: false, value: null };
  if (typeof value !== "number" && typeof value !== "string") return { present: false, value: null };
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed)
    ? { present: true, value: parsed }
    : { present: false, value: null };
}

function numberInRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function healthDateInShanghai(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function weightInKg(value: unknown, units = "kg") {
  const parsed = parseOptionalNumber(value);
  if (!parsed.present) return null;
  const normalizedUnits = units.toLowerCase();
  const kilograms = normalizedUnits.startsWith("lb")
    ? parsed.value * 0.45359237
    : normalizedUnits.startsWith("g") && !normalizedUnits.startsWith("kg")
      ? parsed.value / 1000
      : parsed.value;
  return kilograms >= 20 && kilograms <= 400 ? Math.round(kilograms * 1000) / 1000 : null;
}

function energyInKcal(value: unknown, units = "kcal") {
  const parsed = parseOptionalNumber(value);
  if (!parsed.present) return null;
  const normalizedUnits = units.toLowerCase().replaceAll(/\s/g, "");
  const kilocalories = normalizedUnits === "kj" || normalizedUnits.startsWith("kilojoule")
    ? parsed.value / 4.184
    : normalizedUnits === "j" || normalizedUnits.startsWith("joule")
      ? parsed.value / 4_184
      : parsed.value;
  return numberInRange(Math.round(kilocalories * 1_000_000) / 1_000_000, 0, 20_000);
}

function heartRateInBpm(value: unknown) {
  const parsed = parseOptionalNumber(value);
  return parsed.present && parsed.value >= 20 && parsed.value <= 250
    ? Math.round(parsed.value * 10) / 10
    : null;
}

function sleepDurationMinutes(point: NonNullable<HealthMetric["data"]>[number], units = "min") {
  const unitMultiplier = units.toLowerCase().startsWith("hr")
    ? 60
    : units.toLowerCase().startsWith("sec")
      ? 1 / 60
      : 1;
  const aggregatedTotal = parseOptionalNumber(point.totalSleep ?? point.asleep);
  if (aggregatedTotal.present) {
    return numberInRange(aggregatedTotal.value * unitMultiplier, 0, 1_440);
  }
  const stages = [point.core, point.deep, point.rem].map(parseOptionalNumber);
  if (stages.some((result) => result.present)) {
    const stageTotal = stages.reduce((sum, result) => sum + (result.present ? result.value : 0), 0);
    return numberInRange(stageTotal * unitMultiplier, 0, 1_440);
  }

  const start = Date.parse(point.startDate ?? "");
  const end = Date.parse(point.endDate ?? "");
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.min(1_440, (end - start) / 60_000);
  }

  const quantity = parseOptionalNumber(point.qty);
  if (!quantity.present) return null;
  const minutes = quantity.value * unitMultiplier;
  return numberInRange(minutes, 0, 1_440);
}

export function selectHealthUpdateFields(
  row: NormalizedHealthRow,
  coverage: readonly HealthMetricKey[],
): Partial<NormalizedHealthRow> {
  return {
    ...(coverage.includes("steps") ? { steps: row.steps } : {}),
    ...(coverage.includes("activeEnergyKcal") ? { activeEnergyKcal: row.activeEnergyKcal } : {}),
    ...(coverage.includes("restingEnergyKcal") ? { restingEnergyKcal: row.restingEnergyKcal } : {}),
    ...(coverage.includes("exerciseMinutes") ? { exerciseMinutes: row.exerciseMinutes } : {}),
    ...(coverage.includes("workoutCount") ? { workoutCount: row.workoutCount } : {}),
    ...(coverage.includes("weightKg") && row.weightKg !== null ? { weightKg: row.weightKg } : {}),
    ...(coverage.includes("sleepMinutes") && row.sleepMinutes !== null ? { sleepMinutes: row.sleepMinutes } : {}),
    ...(coverage.includes("restingHeartRateBpm") && row.restingHeartRateBpm !== null
      ? { restingHeartRateBpm: row.restingHeartRateBpm }
      : {}),
    source: row.source,
  };
}

export function normalizeHealthIngestion(payload: HealthPayload): NormalizedHealthIngestion {
  const metrics = payload.data?.metrics ?? payload.metrics;
  if (!Array.isArray(metrics)) {
    const date = healthDateInShanghai(payload.date);
    if (!date) return { rows: [], coverage: {} };

    const steps = parseOptionalNumber(payload.steps);
    const activeEnergy = parseOptionalNumber(payload.activeEnergyKcal);
    const restingEnergy = parseOptionalNumber(payload.restingEnergyKcal);
    const exerciseMinutes = parseOptionalNumber(payload.exerciseMinutes);
    const workoutCount = parseOptionalNumber(payload.workoutCount);
    const sleepMinutes = parseOptionalNumber(payload.sleepMinutes);
    const rootWorkouts = payload.data?.workouts ?? payload.workouts;
    const explicitWorkoutCount = Array.isArray(rootWorkouts)
      ? { present: true as const, value: rootWorkouts.length }
      : workoutCount;

    const row = {
      date,
      steps: steps.present ? Math.round(numberInRange(steps.value, 0, 200_000)) : 0,
      activeEnergyKcal: activeEnergy.present ? numberInRange(activeEnergy.value, 0, 20_000) : 0,
      restingEnergyKcal: restingEnergy.present ? numberInRange(restingEnergy.value, 0, 20_000) : 0,
      exerciseMinutes: exerciseMinutes.present ? numberInRange(exerciseMinutes.value, 0, 1_440) : 0,
      workoutCount: explicitWorkoutCount.present ? Math.round(numberInRange(explicitWorkoutCount.value, 0, 100)) : 0,
      weightKg: weightInKg(payload.weightKg),
      sleepMinutes: sleepMinutes.present ? numberInRange(sleepMinutes.value, 0, 1_440) : null,
      restingHeartRateBpm: heartRateInBpm(payload.restingHeartRateBpm),
      source: payload.source?.trim().slice(0, 64) || "apple-health",
    } satisfies NormalizedHealthRow;
    const coverage: HealthMetricKey[] = [
      steps.present ? "steps" : null,
      activeEnergy.present ? "activeEnergyKcal" : null,
      restingEnergy.present ? "restingEnergyKcal" : null,
      exerciseMinutes.present ? "exerciseMinutes" : null,
      explicitWorkoutCount.present ? "workoutCount" : null,
      row.weightKg !== null ? "weightKg" : null,
      sleepMinutes.present ? "sleepMinutes" : null,
      row.restingHeartRateBpm !== null ? "restingHeartRateBpm" : null,
    ].filter((key): key is HealthMetricKey => key !== null);
    return { rows: [row], coverage: { [date]: coverage } };
  }

  const days = new Map<string, NormalizedHealthRow>();
  const coverage = new Map<string, Set<HealthMetricKey>>();
  const exerciseNames = new Set(["apple_exercise_time", "exercise_time", "apple_exercise_minutes"]);
  const restingEnergyNames = new Set(["basal_energy", "basal_energy_burned", "resting_energy", "resting_energy_burned"]);
  const weightNames = new Set(["weight", "body_weight", "body_mass", "weight_body_mass"]);
  const sleepNames = new Set(["sleep", "sleep_analysis", "sleep_asleep", "sleep_core", "sleep_deep", "sleep_rem"]);
  const restingHeartRateNames = new Set(["resting_heart_rate", "heart_rate_resting", "restingheartrate"]);

  for (const metric of metrics) {
    const name = metric.name?.toLowerCase() ?? "";
    if (name !== "step_count" && name !== "active_energy" && !exerciseNames.has(name) && !restingEnergyNames.has(name) && !weightNames.has(name) && !sleepNames.has(name) && !restingHeartRateNames.has(name)) continue;

    for (const point of metric.data ?? []) {
      const date = healthDateInShanghai(point.sleepEnd ?? point.endDate ?? point.date);
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
        restingHeartRateBpm: null,
        source: "health-auto-export",
      };
      const dayCoverage = coverage.get(date) ?? new Set<HealthMetricKey>();
      const parsedQuantity = parseOptionalNumber(point.qty);
      const qty = parsedQuantity.present ? numberInRange(parsedQuantity.value, 0, 200_000) : 0;
      if (name === "step_count" && parsedQuantity.present) {
        day.steps += Math.round(qty);
        dayCoverage.add("steps");
      }
      if (name === "active_energy" && parsedQuantity.present) {
        day.activeEnergyKcal += energyInKcal(point.qty, metric.units) ?? 0;
        dayCoverage.add("activeEnergyKcal");
      }
      if (restingEnergyNames.has(name) && parsedQuantity.present) {
        day.restingEnergyKcal += energyInKcal(point.qty, metric.units) ?? 0;
        dayCoverage.add("restingEnergyKcal");
      }
      if (exerciseNames.has(name) && parsedQuantity.present) {
        const minutes = metric.units?.toLowerCase().startsWith("hr") ? qty * 60 : qty;
        day.exerciseMinutes = numberInRange(day.exerciseMinutes + minutes, 0, 1_440);
        dayCoverage.add("exerciseMinutes");
      }
      if (weightNames.has(name)) {
        const weight = weightInKg(point.qty, metric.units);
        if (weight !== null) {
          day.weightKg = weight;
          dayCoverage.add("weightKg");
        }
      }
      if (sleepNames.has(name)) {
        const stage = (point.sleepStage ?? point.value ?? name).toLowerCase().replaceAll(/[\s_-]/g, "");
        if (!stage.includes("awake") && !stage.includes("inbed")) {
          const duration = sleepDurationMinutes(point, metric.units);
          if (duration !== null) {
            day.sleepMinutes = (day.sleepMinutes ?? 0) + duration;
            dayCoverage.add("sleepMinutes");
          }
        }
      }
      if (restingHeartRateNames.has(name)) {
        const restingHeartRate = heartRateInBpm(point.qty);
        if (restingHeartRate !== null) {
          day.restingHeartRateBpm = restingHeartRate;
          dayCoverage.add("restingHeartRateBpm");
        }
      }
      days.set(date, day);
      coverage.set(date, dayCoverage);
    }
  }

  const workouts = payload.data?.workouts ?? payload.workouts;
  if (Array.isArray(workouts)) {
    if (workouts.length === 0) {
      const date = healthDateInShanghai(payload.date);
      if (date) {
        const day = days.get(date) ?? {
          date,
          steps: 0,
          activeEnergyKcal: 0,
          restingEnergyKcal: 0,
          exerciseMinutes: 0,
          workoutCount: 0,
          weightKg: null,
          sleepMinutes: null,
          restingHeartRateBpm: null,
          source: "health-auto-export",
        };
        const dayCoverage = coverage.get(date) ?? new Set<HealthMetricKey>();
        day.workoutCount = 0;
        dayCoverage.add("workoutCount");
        days.set(date, day);
        coverage.set(date, dayCoverage);
      }
    } else {
      const workoutCounts = new Map<string, number>();
      for (const workout of workouts) {
        const date = healthDateInShanghai(workout.endDate ?? workout.startDate ?? workout.date);
        if (date) workoutCounts.set(date, (workoutCounts.get(date) ?? 0) + 1);
      }
      for (const [date, count] of workoutCounts) {
        const day = days.get(date) ?? {
          date,
          steps: 0,
          activeEnergyKcal: 0,
          restingEnergyKcal: 0,
          exerciseMinutes: 0,
          workoutCount: 0,
          weightKg: null,
          sleepMinutes: null,
          restingHeartRateBpm: null,
          source: "health-auto-export",
        };
        const dayCoverage = coverage.get(date) ?? new Set<HealthMetricKey>();
        day.workoutCount = Math.min(100, count);
        dayCoverage.add("workoutCount");
        days.set(date, day);
        coverage.set(date, dayCoverage);
      }
    }
  }

  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    rows,
    coverage: Object.fromEntries(rows.map((row) => [row.date, [...(coverage.get(row.date) ?? [])]])),
  };
}

export function normalizeHealthPayload(payload: HealthPayload) {
  return normalizeHealthIngestion(payload).rows;
}
