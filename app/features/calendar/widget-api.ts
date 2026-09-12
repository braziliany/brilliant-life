import {
  buildCalendarWidgetDto,
  validateCalendarWidgetMonth,
  type CalendarWidgetNote,
} from "./widget-contract.ts";
import type { CalendarOverrides } from "./domain.ts";

export const calendarWidgetHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "CF-Access-Client-Id",
};

type CalendarWidgetData = {
  overrides: CalendarOverrides;
  note?: CalendarWidgetNote | null;
};

type CalendarWidgetDependencies = {
  authorize: (request: Request) => boolean;
  loadMonth: (month: string) => Promise<CalendarWidgetData>;
  now?: () => Date;
};

export async function handleCalendarWidgetGet(request: Request, dependencies: CalendarWidgetDependencies) {
  if (!dependencies.authorize(request)) {
    return Response.json(
      { error: "Cloudflare Access service authentication required" },
      { status: 401, headers: calendarWidgetHeaders },
    );
  }

  const now = dependencies.now?.() ?? new Date();
  const validation = validateCalendarWidgetMonth(new URL(request.url).searchParams, now);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400, headers: calendarWidgetHeaders });
  }

  try {
    const data = await dependencies.loadMonth(validation.month);
    return Response.json(
      buildCalendarWidgetDto({ month: validation.month, ...data, now }),
      { headers: calendarWidgetHeaders },
    );
  } catch {
    return Response.json(
      { error: "Calendar Widget data unavailable" },
      { status: 500, headers: calendarWidgetHeaders },
    );
  }
}

export function calendarWidgetMethodNotAllowed() {
  return Response.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { ...calendarWidgetHeaders, Allow: "GET" } },
  );
}
