import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { healthDaily, healthIngestionRuns } from "../../../db/schema";
import { hasDashboardAccess } from "../access";
import { handleHealthIngest } from "./ingest-handler";

const jsonHeaders = {
  "Cache-Control": "no-store",
};

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

export const POST = handleHealthIngest;
