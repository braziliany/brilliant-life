import {
  getCalendarMonthShape,
  getHolidayCalendar,
  resolveCalendarDay,
  shiftCalendarMonth,
  type CalendarOverrides,
} from "./domain.ts";

export const CALENDAR_WIDGET_SCHEMA_VERSION = "1.0";
export const CALENDAR_WIDGET_TIME_ZONE = "Asia/Shanghai";

export type CalendarWidgetNote = {
  scheduleNote?: string | null;
  leaveNote?: string | null;
  overtimeNote?: string | null;
};

export type CalendarWidgetDay = {
  date: string;
  isWorkday: boolean;
  isOfficialWorkday: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isMakeupWorkday: boolean;
  hasPersonalOverride: boolean;
  personalOverride: "workday" | "restday" | null;
};

export type CalendarWidgetDto = {
  schemaVersion: typeof CALENDAR_WIDGET_SCHEMA_VERSION;
  month: string;
  timeZone: typeof CALENDAR_WIDGET_TIME_ZONE;
  generatedAt: string;
  today: string;
  officialCalendarConfigured: boolean;
  days: CalendarWidgetDay[];
  notesSummary: {
    hasScheduleNote: boolean;
    hasLeaveNote: boolean;
    hasOvertimeNote: boolean;
  };
};

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function getShanghaiToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_WIDGET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function parseCalendarWidgetMonth(value: string) {
  const match = monthPattern.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

export function getAllowedCalendarWidgetMonths(now: Date) {
  const today = getShanghaiToday(now);
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  return [-1, 0, 1].map((offset) => {
    const shifted = shiftCalendarMonth(current, offset);
    return `${shifted.year}-${String(shifted.month + 1).padStart(2, "0")}`;
  });
}

export function validateCalendarWidgetMonth(searchParams: URLSearchParams, now: Date) {
  const values = searchParams.getAll("month");
  if (values.length !== 1 || !parseCalendarWidgetMonth(values[0])) {
    return { ok: false as const, error: "month must appear once and use YYYY-MM" };
  }
  if (!getAllowedCalendarWidgetMonths(now).includes(values[0])) {
    return { ok: false as const, error: "month must be the current Shanghai month or an adjacent month" };
  }
  return { ok: true as const, month: values[0] };
}

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export function buildCalendarWidgetDto(input: {
  month: string;
  overrides: CalendarOverrides;
  note?: CalendarWidgetNote | null;
  now: Date;
}): CalendarWidgetDto {
  const parsed = parseCalendarWidgetMonth(input.month);
  if (!parsed) throw new Error("Invalid Calendar Widget month");

  const { year, month } = parsed;
  const { daysInMonth } = getCalendarMonthShape(year, month);
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const resolved = resolveCalendarDay(year, month, index + 1, input.overrides);
    const override = resolved.personalOverride ? input.overrides[resolved.date] : undefined;
    return {
      date: resolved.date,
      isWorkday: resolved.workday,
      isOfficialWorkday: resolved.officialWorkday,
      isHoliday: resolved.holiday !== null,
      holidayName: resolved.holiday,
      isMakeupWorkday: resolved.makeup,
      hasPersonalOverride: resolved.personalOverride,
      personalOverride: override === undefined ? null : override ? "workday" : "restday",
    };
  });

  return {
    schemaVersion: CALENDAR_WIDGET_SCHEMA_VERSION,
    month: input.month,
    timeZone: CALENDAR_WIDGET_TIME_ZONE,
    generatedAt: input.now.toISOString(),
    today: getShanghaiToday(input.now),
    officialCalendarConfigured: getHolidayCalendar(year).status === "configured",
    days,
    notesSummary: {
      hasScheduleNote: hasText(input.note?.scheduleNote),
      hasLeaveNote: hasText(input.note?.leaveNote),
      hasOvertimeNote: hasText(input.note?.overtimeNote),
    },
  };
}
