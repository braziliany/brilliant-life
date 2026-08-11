import { holidayCalendar2026 } from "./holiday-data/2026.ts";

export type CalendarMonth = { year: number; month: number };
export type CalendarOverrides = Record<string, boolean>;

type HolidayRange = readonly [start: string, end: string, name: string];
type ConfiguredHolidayCalendar = {
  status: "configured";
  year: number;
  holidayRanges: readonly HolidayRange[];
  makeupWorkdays: ReadonlySet<string>;
};
type UnconfiguredHolidayCalendar = { status: "unconfigured"; year: number };
export type HolidayCalendar = ConfiguredHolidayCalendar | UnconfiguredHolidayCalendar;

const holidayCalendars = new Map<number, ConfiguredHolidayCalendar>([
  [holidayCalendar2026.year, {
    status: "configured",
    year: holidayCalendar2026.year,
    holidayRanges: holidayCalendar2026.holidayRanges,
    makeupWorkdays: new Set(holidayCalendar2026.makeupWorkdays),
  }],
]);

export const getHolidayCalendar = (year: number): HolidayCalendar =>
  holidayCalendars.get(year) ?? { status: "unconfigured", year };

export const calendarDateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const getHolidayName = (date: string) => {
  const calendar = getHolidayCalendar(Number(date.slice(0, 4)));
  if (calendar.status === "unconfigured") return null;
  return calendar.holidayRanges.find(([start, end]) => date >= start && date <= end)?.[2] ?? null;
};

export const isMakeupWorkday = (date: string) => {
  const calendar = getHolidayCalendar(Number(date.slice(0, 4)));
  return calendar.status === "configured" && calendar.makeupWorkdays.has(date);
};

export const isOfficialWorkday = (year: number, month: number, day: number) => {
  const key = calendarDateKey(year, month, day);
  if (isMakeupWorkday(key)) return true;
  if (getHolidayName(key)) return false;
  const weekday = new Date(year, month, day).getDay();
  return weekday !== 0 && weekday !== 6;
};

export const shiftCalendarMonth = (current: CalendarMonth, offset: number): CalendarMonth => {
  const next = new Date(current.year, current.month + offset, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
};

export const resolveCalendarDay = (
  year: number,
  month: number,
  day: number,
  overrides: CalendarOverrides,
) => {
  const date = calendarDateKey(year, month, day);
  const officialWorkday = isOfficialWorkday(year, month, day);
  const personalOverride = Object.prototype.hasOwnProperty.call(overrides, date);

  return {
    date,
    holiday: getHolidayName(date),
    makeup: isMakeupWorkday(date),
    officialWorkday,
    workday: overrides[date] ?? officialWorkday,
    personalOverride,
  };
};

export const getCalendarMonthShape = (year: number, month: number) => {
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return {
    firstDayOffset,
    daysInMonth,
    calendarDays,
    calendarRows: Math.ceil(calendarDays.length / 7),
  };
};

export const countCalendarMonthWorkdays = (
  year: number,
  month: number,
  overrides: CalendarOverrides,
) => {
  const { daysInMonth } = getCalendarMonthShape(year, month);
  return Array.from({ length: daysInMonth }, (_, index) => index + 1)
    .filter((day) => resolveCalendarDay(year, month, day, overrides).workday)
    .length;
};

export const summarizeCalendarMonthProgress = (
  year: number,
  month: number,
  asOfDate: string,
  overrides: CalendarOverrides,
) => {
  const { daysInMonth } = getCalendarMonthShape(year, month);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const asOfMonth = asOfDate.slice(0, 7);
  const cutoff = monthKey < asOfMonth
    ? daysInMonth
    : monthKey > asOfMonth
      ? 0
      : Math.max(0, Math.min(Number(asOfDate.slice(-2)), daysInMonth));
  const resolved = Array.from({ length: daysInMonth }, (_, index) =>
    resolveCalendarDay(year, month, index + 1, overrides),
  );
  const workdays = resolved.filter((day) => day.workday);
  return {
    totalWorkdays: workdays.length,
    elapsedWorkdays: workdays.filter((day) => Number(day.date.slice(-2)) <= cutoff).length,
    remainingWorkdays: workdays.filter((day) => Number(day.date.slice(-2)) > cutoff).length,
    holidayDays: resolved.filter((day) => day.holiday !== null).length,
    makeupWorkdays: resolved.filter((day) => day.makeup).length,
    personalAdjustments: resolved.filter((day) => day.personalOverride).length,
  };
};

export const calculateAnnualWorkdays = (year: number, overrides: CalendarOverrides) => {
  const monthlyWorkdays = Array.from(
    { length: 12 },
    (_, month) => countCalendarMonthWorkdays(year, month, overrides),
  );

  return {
    monthlyWorkdays,
    totalWorkdays: monthlyWorkdays.reduce((sum, count) => sum + count, 0),
  };
};

export const getWorkdayToggle = (
  year: number,
  month: number,
  day: number,
  overrides: CalendarOverrides,
) => {
  const resolved = resolveCalendarDay(year, month, day, overrides);
  return {
    date: resolved.date,
    hadOverride: resolved.personalOverride,
    previous: resolved.workday,
    next: !resolved.workday,
  };
};
