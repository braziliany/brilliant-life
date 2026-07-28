import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { healthDaily } from "../../../db/schema";
import { type HealthPayload, isValidHealthApiKey, normalizeHealthPayload } from "../validation";

const jsonHeaders = {
  "Cache-Control": "no-store",
};

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
  if (!isValidHealthApiKey(configuredKey, suppliedKey)) {
    return Response.json({ error: "Invalid API key" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = (await request.json()) as HealthPayload;
    const rows = normalizeHealthPayload(payload);
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
