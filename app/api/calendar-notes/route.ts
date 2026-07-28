import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { calendarNotes } from "../../../db/schema";
import { hasDashboardAccess } from "../access";

const jsonHeaders = { "Cache-Control": "no-store" };

function validMonth(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function cleanNote(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!validMonth(month)) return Response.json({ error: "month must use YYYY-MM" }, { status: 400, headers: jsonHeaders });
  try {
    const [note] = await getDb().select().from(calendarNotes).where(eq(calendarNotes.month, month)).limit(1);
    return Response.json({ note: note ?? { month, scheduleNote: "", leaveNote: "", overtimeNote: "" } }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Calendar notes unavailable" }, { status: 500, headers: jsonHeaders });
  }
}

export async function PUT(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (!validMonth(payload.month)) return Response.json({ error: "month must use YYYY-MM" }, { status: 400, headers: jsonHeaders });
    const values = {
      month: payload.month as string,
      scheduleNote: cleanNote(payload.scheduleNote),
      leaveNote: cleanNote(payload.leaveNote),
      overtimeNote: cleanNote(payload.overtimeNote),
      updatedAt: new Date().toISOString(),
    };
    await getDb().insert(calendarNotes).values(values).onConflictDoUpdate({
      target: calendarNotes.month,
      set: values,
    });
    return Response.json({ note: values }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Calendar notes update failed" }, { status: 500, headers: jsonHeaders });
  }
}
