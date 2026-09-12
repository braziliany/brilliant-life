import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { calendarNotes, calendarOverrides } from "../../../../../db/schema";
import { hasDashboardAccess } from "../../../access";
import {
  calendarWidgetMethodNotAllowed,
  handleCalendarWidgetGet,
} from "../../../../features/calendar/widget-api.ts";

function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function GET(request: Request) {
  return handleCalendarWidgetGet(request, {
    authorize: hasDashboardAccess,
    async loadMonth(month) {
      const db = getDb();
      const start = `${month}-01`;
      const [overrideRows, noteRows] = await Promise.all([
        db.select({ date: calendarOverrides.date, isWorkday: calendarOverrides.isWorkday })
          .from(calendarOverrides)
          .where(and(gte(calendarOverrides.date, start), lt(calendarOverrides.date, nextMonthStart(month)))),
        db.select({
          scheduleNote: calendarNotes.scheduleNote,
          leaveNote: calendarNotes.leaveNote,
          overtimeNote: calendarNotes.overtimeNote,
        }).from(calendarNotes).where(eq(calendarNotes.month, month)).limit(1),
      ]);
      return {
        overrides: Object.fromEntries(overrideRows.map((row) => [row.date, row.isWorkday])),
        note: noteRows[0] ?? null,
      };
    },
  });
}

export const POST = calendarWidgetMethodNotAllowed;
export const PUT = calendarWidgetMethodNotAllowed;
export const PATCH = calendarWidgetMethodNotAllowed;
export const DELETE = calendarWidgetMethodNotAllowed;
