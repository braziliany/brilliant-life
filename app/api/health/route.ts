import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { healthDaily } from "../../../db/schema";

type HealthPayload = {
  date?: string;
  steps?: number;
  activeEnergyKcal?: number;
  restingEnergyKcal?: number;
  exerciseMinutes?: number;
  workoutCount?: number;
  source?: string;
  metrics?: Array<{
    name?: string;
    units?: string;
    data?: Array<{ qty?: number; date?: string }>;
  }>;
  data?: {
    metrics?: Array<{
      name?: string;
      units?: string;
      data?: Array<{ qty?: number; date?: string }>;
    }>;
  };
};

const jsonHeaders = {
  "Cache-Control": "no-store",
};

function numberInRange(value: unknown, min: number, max: number) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

function hasDashboardAccess(request: Request) {
  const host = new URL(request.url).hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    request.headers.has("Cf-Access-Jwt-Assertion")
  );
}

function dateOnly(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function normalizePayload(payload: HealthPayload) {
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
      if (exerciseNames.has(name)) {
        day.exerciseMinutes += metric.units?.toLowerCase().startsWith("hr") ? qty * 60 : qty;
      }
      days.set(date, day);
    }
  }

  return [...days.values()];
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 1);
    const days = requestedDays === 30 ? 30 : requestedDays === 7 ? 7 : 1;
    const history = await getDb()
      .select()
      .from(healthDaily)
      .orderBy(desc(healthDaily.date))
      .limit(days);
    return Response.json({ health: history[0] ?? null, history }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    return Response.json({ error: message }, { status: 500, headers: jsonHeaders });
  }
}

export async function POST(request: Request) {
  const configuredKey = (env as unknown as { HEALTH_INGEST_API_KEY?: string }).HEALTH_INGEST_API_KEY;
  const suppliedKey = request.headers.get("X-API-Key");
  if (!configuredKey || !suppliedKey || suppliedKey !== configuredKey) {
    return Response.json({ error: "Invalid API key" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = (await request.json()) as HealthPayload;
    const rows = normalizePayload(payload);
    if (rows.length === 0) {
      return Response.json(
        { error: "No supported health metrics found" },
        { status: 400, headers: jsonHeaders }
      );
    }

    const db = getDb();
    for (const row of rows) {
      const values = { ...row, updatedAt: new Date().toISOString() };
      await db.insert(healthDaily).values(values).onConflictDoUpdate({
        target: healthDaily.date,
        set: values,
      });
    }
    const [health] = await db
      .select()
      .from(healthDaily)
      .where(eq(healthDaily.date, rows.at(-1)!.date))
      .limit(1);
    return Response.json({ imported: rows.length, health }, { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof SyntaxError ? "Invalid JSON payload" : "Health data import failed";
    return Response.json({ error: message }, { status: 400, headers: jsonHeaders });
  }
}
