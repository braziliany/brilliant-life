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
