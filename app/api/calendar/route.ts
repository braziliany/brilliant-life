import { and, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { calendarOverrides } from "../../../db/schema";

const jsonHeaders = { "Cache-Control": "no-store" };

function hasDashboardAccess(request: Request) {
  const host = new URL(request.url).hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    request.headers.has("Cf-Access-Jwt-Assertion")
  );
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "month must use YYYY-MM" }, { status: 400, headers: jsonHeaders });
  }

  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;

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
