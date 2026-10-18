import { validDate, validMonth } from "../../api/validation.ts";

type Arrangement = { date: string; isWorkday: boolean };
type CalendarMutationDependencies = {
  authorize: (request: Request) => boolean;
  save: (arrangement: Arrangement) => Promise<unknown>;
  remove: (date: string) => Promise<unknown>;
  resetMonth: (month: string) => Promise<unknown>;
};

const headers = { "Cache-Control": "no-store" };

export async function handleCalendarMutation(request: Request, deps: CalendarMutationDependencies) {
  if (!deps.authorize(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers });
  }
  if (request.method !== "PUT" && request.method !== "DELETE") {
    return new Response(null, { status: 405, headers });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const row: Record<string, unknown> = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};

  if (request.method === "PUT") {
    if (!validDate(row.date) || typeof row.isWorkday !== "boolean") {
      return Response.json({ error: "date and isWorkday are required" }, { status: 400, headers });
    }
    try {
      const override = await deps.save({ date: row.date, isWorkday: row.isWorkday });
      return Response.json({ override }, { headers });
    } catch {
      return Response.json({ error: "Calendar update failed" }, { status: 500, headers });
    }
  }

  // An explicitly supplied invalid date must not fall through to a month reset.
  const date = validDate(row.date) ? row.date : null;
  const month = !Object.hasOwn(row, "date") && validMonth(row.month) ? row.month as string : null;
  if (!date && !month) {
    return Response.json({ error: "date or month is required" }, { status: 400, headers });
  }
  try {
    if (date) {
      await deps.remove(date);
      return Response.json({ deleted: date }, { headers });
    }
    await deps.resetMonth(month!);
    return Response.json({ reset: month }, { headers });
  } catch {
    return Response.json({ error: "Calendar reset failed" }, { status: 500, headers });
  }
}
