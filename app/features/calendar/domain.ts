export type CalendarMonth = { year: number; month: number };
export type CalendarOverrides = Record<string, boolean>;

const holidayRanges = [
  ["2026-01-01", "2026-01-03", "元旦"],
  ["2026-02-15", "2026-02-23", "春节"],
  ["2026-04-04", "2026-04-06", "清明"],
  ["2026-05-01", "2026-05-05", "劳动节"],
  ["2026-06-19", "2026-06-21", "端午"],
  ["2026-09-25", "2026-09-27", "中秋"],
  ["2026-10-01", "2026-10-07", "国庆"],
] as const;

const makeupWorkdays = new Set([
  "2026-01-04",
  "2026-02-14",
  "2026-02-28",
  "2026-05-09",
  "2026-09-20",
  "2026-10-10",
]);

export const calendarDateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const getHolidayName = (date: string) =>
  holidayRanges.find(([start, end]) => date >= start && date <= end)?.[2] ?? null;

export const isMakeupWorkday = (date: string) => makeupWorkdays.has(date);

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
