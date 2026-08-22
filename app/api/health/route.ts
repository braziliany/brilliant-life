import { desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { healthDaily, healthIngestionRuns } from "../../../db/schema";
import { hasDashboardAccess } from "../access";
import {
  type HealthPayload,
  isValidHealthApiKey,
  mergeHealthMetricCoverage,
  normalizeHealthIngestion,
  selectHealthUpdateFields,
} from "../validation";

const jsonHeaders = {
  "Cache-Control": "no-store",
};

const AUTO_EXPORT_HEALTH_SOURCE = "Auto Export Health";

const parseStringArray = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 1);
    const days = requestedDays === 30 ? 30 : requestedDays === 7 ? 7 : 1;
    const db = getDb();
    const [history, ingestionRows] = await Promise.all([
      db.select().from(healthDaily).orderBy(desc(healthDaily.date)).limit(days),
      db.select().from(healthIngestionRuns).orderBy(desc(healthIngestionRuns.receivedAt)).limit(100),
    ]);
    const ingestions = ingestionRows.map((run) => ({
      ...run,
      coveredDates: parseStringArray(run.coveredDates),
      metricKeys: parseStringArray(run.metricKeys),
    }));
    const lastSuccessfulIngestion = ingestions.find((run) => run.status === "success") ?? null;
    return Response.json({
      health: history[0] ?? null,
      history,
      ingestions,
      sync: lastSuccessfulIngestion ? {
        lastReceivedAt: lastSuccessfulIngestion.receivedAt,
        dataDateStart: lastSuccessfulIngestion.coveredDates[0] ?? null,
        dataDateEnd: lastSuccessfulIngestion.coveredDates.at(-1) ?? null,
        importedDays: lastSuccessfulIngestion.importedDays,
        source: lastSuccessfulIngestion.source,
      } : null,
    }, { headers: jsonHeaders });
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

  const receivedAt = new Date().toISOString();
  const db = getDb();
  let payload: HealthPayload;
  try {
    payload = (await request.json()) as HealthPayload;
  } catch {
    try {
      await db.insert(healthIngestionRuns).values({
        receivedAt,
        status: "invalid_payload",
        source: null,
      });
    } catch {
      // Keep the public error stable even if ingestion diagnostics are unavailable.
    }
    return Response.json({ error: "Invalid JSON payload" }, { status: 400, headers: jsonHeaders });
  }

  try {
    const { rows, coverage } = normalizeHealthIngestion(payload);
    if (rows.length === 0) {
      await db.insert(healthIngestionRuns).values({
        receivedAt,
        status: "no_supported_metrics",
        source: AUTO_EXPORT_HEALTH_SOURCE,
      });
      return Response.json(
        { error: "No supported health metrics found" },
        { status: 400, headers: jsonHeaders }
      );
    }

    const existingRows = await db
      .select({ date: healthDaily.date, metricCoverage: healthDaily.metricCoverage })
      .from(healthDaily)
      .where(inArray(healthDaily.date, rows.map((row) => row.date)));
    const existingCoverage = new Map(existingRows.map((row) => [row.date, row.metricCoverage]));
    const existingDates = new Set(existingRows.map((row) => row.date));
    const rowsInserted = rows.filter((row) => !existingDates.has(row.date)).length;
    const rowsUpdated = rows.length - rowsInserted;
    for (const row of rows) {
      const incomingCoverage = coverage[row.date] ?? [];
      const mergedCoverage = mergeHealthMetricCoverage(existingCoverage.get(row.date), incomingCoverage);
      const metricCoverage = JSON.stringify(mergedCoverage);
      const values = { ...row, metricCoverage, updatedAt: new Date().toISOString() };
      const updateFields = selectHealthUpdateFields(row, incomingCoverage);
      await db.insert(healthDaily).values(values).onConflictDoUpdate({
        target: healthDaily.date,
        set: {
          ...updateFields,
          metricCoverage,
          updatedAt: values.updatedAt,
        },
      });
    }
    const metricKeys = [...new Set(rows.flatMap((row) => coverage[row.date] ?? []))];
    await db.insert(healthIngestionRuns).values({
      receivedAt,
      coveredDates: JSON.stringify(rows.map((row) => row.date)),
      metricKeys: JSON.stringify(metricKeys),
      importedDays: rows.length,
      status: "success",
      source: AUTO_EXPORT_HEALTH_SOURCE,
    });
    const [health] = await db
      .select()
      .from(healthDaily)
      .where(eq(healthDaily.date, rows.at(-1)!.date))
      .limit(1);
    return Response.json({
      imported: rows.length,
      health,
      sync: {
        receivedAt,
        dataDateStart: rows[0].date,
        dataDateEnd: rows.at(-1)!.date,
        rowsInserted,
        rowsUpdated,
        source: AUTO_EXPORT_HEALTH_SOURCE,
      },
    }, { status: 200, headers: jsonHeaders });
  } catch (error) {
    return Response.json({ error: "Health data import failed" }, { status: 400, headers: jsonHeaders });
  }
}
