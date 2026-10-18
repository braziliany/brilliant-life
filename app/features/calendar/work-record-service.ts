import { eq } from "drizzle-orm";
import { calendarWorkRecords } from "../../../db/schema.ts";
import type { CalendarWorkRecord } from "./domain.ts";
import { hasDashboardMutationOrigin } from "../../api/access.ts";
import { validDate } from "../../api/validation.ts";

export { validDate as validCalendarDate } from "../../api/validation.ts";

export function parseWorkRecord(payload: unknown): ({ date: string } & CalendarWorkRecord) | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  if (Object.keys(row).some(key => !["date", "worked", "hours"].includes(key))) return null;
  if (!validDate(row.date) || typeof row.worked !== "boolean") return null;
  // Omitted hours mean unknown, never zero. Explicit null clears hours.
  const hours = row.hours === undefined ? null : row.hours;
  if (hours !== null && (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0 || hours > 24)) return null;
  if ((row.worked && hours === 0) || (!row.worked && hours !== null && hours !== 0)) return null;
  return { date: row.date, worked: row.worked, hours: hours as number | null };
}

type WorkDb = Pick<ReturnType<typeof import("../../../db/index.ts").getDb>, "insert" | "delete">;

export async function saveWorkRecord(db: WorkDb, record: { date: string } & CalendarWorkRecord) {
  const values = { ...record, updatedAt: new Date().toISOString() };
  await db.insert(calendarWorkRecords).values(values).onConflictDoUpdate({ target: calendarWorkRecords.date, set: values });
  return values;
}

export async function handleWorkRecordMutation(request: Request, deps: {
  authorize: (request: Request) => boolean;
  save: (record: { date: string } & CalendarWorkRecord) => Promise<unknown>;
  remove: (date: string) => Promise<unknown>;
}) {
  const headers = { "Cache-Control": "no-store" };
  if (!deps.authorize(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers });
  if (!["PUT", "DELETE"].includes(request.method)) return new Response(null, { status: 405, headers });
  if (!hasDashboardMutationOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403, headers });
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return Response.json({ error: "JSON required" }, { status: 415, headers });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  const record = parseWorkRecord(payload);
  const deleteDate = payload && typeof payload === "object" && Object.keys(payload).length === 1 && validDate(payload.date) ? payload.date : null;
  if (request.method === "PUT" ? !record : !deleteDate) return Response.json({ error: "Invalid work record" }, { status: 400, headers });
  try {
    if (request.method === "DELETE") { await deps.remove(deleteDate!); return Response.json({ deleted: deleteDate }, { headers }); }
    return Response.json({ record: await deps.save(record!) }, { headers });
  } catch { return Response.json({ error: "Work record update failed" }, { status: 500, headers }); }
}

export const removeWorkRecord = (db: WorkDb, date: string) => db.delete(calendarWorkRecords).where(eq(calendarWorkRecords.date, date));
