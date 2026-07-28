import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { calendarOverrides } from "../../../db/schema";
import { validDate, validMonth } from "../validation";

const jsonHeaders = { "Cache-Control": "no-store" };

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
    return Response.json({ overrides }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Calendar database unavailable" }, { status: 500, headers: jsonHeaders });
  }
}

export async function PUT(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = (await request.json()) as { date?: string; isWorkday?: boolean };
    if (!validDate(payload.date) || typeof payload.isWorkday !== "boolean") {
      return Response.json({ error: "date and isWorkday are required" }, { status: 400, headers: jsonHeaders });
    }

    const values = {
      date: payload.date!,
      isWorkday: payload.isWorkday,
      updatedAt: new Date().toISOString(),
    };
    await getDb().insert(calendarOverrides).values(values).onConflictDoUpdate({
      target: calendarOverrides.date,
      set: values,
    });
    return Response.json({ override: values }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Calendar update failed" }, { status: 500, headers: jsonHeaders });
  }
}

export async function DELETE(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = (await request.json()) as { date?: string; month?: string };
    if (validDate(payload.date)) {
      await getDb().delete(calendarOverrides).where(eq(calendarOverrides.date, payload.date!));
      return Response.json({ deleted: payload.date }, { headers: jsonHeaders });
    }
    if (validMonth(payload.month)) {
      const start = `${payload.month}-01`;
      const [year, monthNumber] = payload.month.split("-").map(Number);
      const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
      const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
      await getDb().delete(calendarOverrides).where(and(gte(calendarOverrides.date, start), lt(calendarOverrides.date, end)));
      return Response.json({ reset: payload.month }, { headers: jsonHeaders });
    }
    return Response.json({ error: "date or month is required" }, { status: 400, headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Calendar reset failed" }, { status: 500, headers: jsonHeaders });
  }
}
