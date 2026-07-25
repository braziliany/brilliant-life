import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { healthDaily } from "../../../db/schema";

type HealthPayload = {
  date?: string;
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  workoutCount?: number;
  source?: string;
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

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const [latest] = await getDb()
      .select()
      .from(healthDaily)
      .orderBy(desc(healthDaily.date))
      .limit(1);
    return Response.json({ health: latest ?? null }, { headers: jsonHeaders });
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
    const date = payload.date?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "date must use YYYY-MM-DD" }, { status: 400, headers: jsonHeaders });
    }

    const values = {
      date,
      steps: Math.round(numberInRange(payload.steps, 0, 200_000)),
      activeEnergyKcal: numberInRange(payload.activeEnergyKcal, 0, 20_000),
      exerciseMinutes: numberInRange(payload.exerciseMinutes, 0, 1_440),
      workoutCount: Math.round(numberInRange(payload.workoutCount, 0, 100)),
      source: payload.source?.trim().slice(0, 64) || "apple-health",
      updatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db
      .insert(healthDaily)
      .values(values)
      .onConflictDoUpdate({
        target: healthDaily.date,
        set: values,
      });
    const [health] = await db.select().from(healthDaily).where(eq(healthDaily.date, date)).limit(1);
    return Response.json({ health }, { status: 200, headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400, headers: jsonHeaders });
  }
}
