import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { calendarOverrides, calendarWorkRecords } from "../../../db/schema";
import { hasDashboardAccess } from "../access";
import { validMonth } from "../validation";
import { handleCalendarMutation } from "../../features/calendar/arrangement-service";

const jsonHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  const searchParams = new URL(request.url).searchParams;
  const month = searchParams.get("month") ?? "";
  const requestedYear = searchParams.get("year") ?? "";
  if (!validMonth(month) && !/^\d{4}$/.test(requestedYear)) {
    return Response.json({ error: "month must use YYYY-MM or year must use YYYY" }, { status: 400, headers: jsonHeaders });
  }

  const start = month ? `${month}-01` : `${requestedYear}-01-01`;
  let end: string;
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
    end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
  } else {
    end = `${Number(requestedYear) + 1}-01-01`;
  }

  try {
    const overrides = await getDb()
      .select()
      .from(calendarOverrides)
      .where(and(gte(calendarOverrides.date, start), lt(calendarOverrides.date, end)));
    const workRecords = await getDb().select().from(calendarWorkRecords)
      .where(and(gte(calendarWorkRecords.date, start), lt(calendarWorkRecords.date, end)));
    return Response.json({ overrides, workRecords }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Calendar database unavailable" }, { status: 500, headers: jsonHeaders });
  }
}

const mutate = (request: Request) => handleCalendarMutation(request, {
  authorize: hasDashboardAccess,
  save: async (payload) => {
    const values = {
      date: payload.date,
      isWorkday: payload.isWorkday,
      updatedAt: new Date().toISOString(),
    };
    await getDb().insert(calendarOverrides).values(values).onConflictDoUpdate({
      target: calendarOverrides.date,
      set: values,
    });
    return values;
  },
  remove: date => getDb().delete(calendarOverrides).where(eq(calendarOverrides.date, date)),
  resetMonth: async (month) => {
    const start = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
    const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
    await getDb().delete(calendarOverrides).where(and(gte(calendarOverrides.date, start), lt(calendarOverrides.date, end)));
  },
});

export const PUT = mutate;
export const DELETE = mutate;
