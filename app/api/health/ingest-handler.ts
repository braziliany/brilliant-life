import { eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { healthDaily, healthIngestionRuns } from "../../../db/schema";
import {
  mergeHealthMetricCoverage,
  normalizeHealthIngestion,
  selectHealthUpdateFields,
} from "../validation";
import { handleHealthIngestPost } from "../../features/health/ingest-api";

const jsonHeaders = {
  "Cache-Control": "no-store",
};

const AUTO_EXPORT_HEALTH_SOURCE = "Auto Export Health";

export function handleHealthIngest(request: Request) {
  const configuredKey = (env as unknown as { HEALTH_INGEST_API_KEY?: string }).HEALTH_INGEST_API_KEY;

  return handleHealthIngestPost(request, {
    configuredKey,
    async recordInvalidPayload(receivedAt) {
      const db = getDb();
      await db.insert(healthIngestionRuns).values({
        receivedAt,
        status: "invalid_payload",
        source: null,
      });
    },
    async ingest(payload, receivedAt) {
      const db = getDb();
      const { rows, coverage } = normalizeHealthIngestion(payload);
      if (rows.length === 0) {
        await db.insert(healthIngestionRuns).values({
          receivedAt,
          status: "no_supported_metrics",
          source: AUTO_EXPORT_HEALTH_SOURCE,
        });
        return Response.json(
          { error: "No supported health metrics found" },
          { status: 400, headers: jsonHeaders },
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
    },
  });
}
