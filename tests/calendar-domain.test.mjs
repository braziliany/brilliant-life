import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAnnualWorkdays,
  calendarDateKey,
  countCalendarMonthWorkdays,
  getHolidayName,
  getCalendarMonthShape,
  getWorkdayToggle,
  isMakeupWorkday,
  isOfficialWorkday,
  resolveCalendarDay,
  shiftCalendarMonth,
} from "../app/features/calendar/domain.ts";

test("calendarDateKey preserves zero-based month input and canonical output", () => {
  assert.equal(calendarDateKey(2026, 0, 1), "2026-01-01");
  assert.equal(calendarDateKey(2026, 6, 9), "2026-07-09");
  assert.equal(calendarDateKey(2026, 11, 31), "2026-12-31");
});

test("getHolidayName preserves every 2026 statutory holiday boundary", () => {
  const ranges = [
    ["2026-01-01", "2026-01-03", "元旦"],
    ["2026-02-15", "2026-02-23", "春节"],
    ["2026-04-04", "2026-04-06", "清明"],
    ["2026-05-01", "2026-05-05", "劳动节"],
    ["2026-06-19", "2026-06-21", "端午"],
    ["2026-09-25", "2026-09-27", "中秋"],
    ["2026-10-01", "2026-10-07", "国庆"],
  ];

  for (const [start, end, name] of ranges) {
    assert.equal(getHolidayName(start), name);
    assert.equal(getHolidayName(end), name);
  }
  assert.equal(getHolidayName("2025-12-31"), null);
  assert.equal(getHolidayName("2026-01-04"), null);
  assert.equal(getHolidayName("2026-10-08"), null);
});

test("isMakeupWorkday preserves all configured 2026 makeup dates", () => {
  const configured = [
    "2026-01-04",
    "2026-02-14",
    "2026-02-28",
    "2026-05-09",
    "2026-09-20",
    "2026-10-10",
  ];
  for (const date of configured) assert.equal(isMakeupWorkday(date), true);
  assert.equal(isMakeupWorkday("2026-01-03"), false);
  assert.equal(isMakeupWorkday("2026-10-11"), false);
});

test("isOfficialWorkday preserves makeup, holiday, weekday, and weekend priority", () => {
  assert.equal(isOfficialWorkday(2026, 0, 4), true);
  assert.equal(isOfficialWorkday(2026, 0, 1), false);
  assert.equal(isOfficialWorkday(2026, 6, 6), true);
  assert.equal(isOfficialWorkday(2026, 6, 5), false);
});

test("shiftCalendarMonth preserves ordinary and cross-year transitions", () => {
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 6 }, 1), { year: 2026, month: 7 });
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 6 }, -1), { year: 2026, month: 5 });
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
});

test("resolveCalendarDay preserves official status and explicit personal overrides", () => {
  const overrides = { "2026-07-05": true, "2026-07-06": false };
  const snapshot = structuredClone(overrides);

  assert.deepEqual(resolveCalendarDay(2026, 6, 5, overrides), {
    date: "2026-07-05",
    holiday: null,
    makeup: false,
    officialWorkday: false,
    workday: true,
    personalOverride: true,
  });
  assert.deepEqual(resolveCalendarDay(2026, 6, 6, overrides), {
    date: "2026-07-06",
    holiday: null,
    makeup: false,
    officialWorkday: true,
    workday: false,
    personalOverride: true,
  });
  assert.equal(resolveCalendarDay(2026, 6, 7, overrides).personalOverride, false);
  assert.deepEqual(overrides, snapshot);
});

test("getCalendarMonthShape preserves Monday-first placement and row count", () => {
  const february = getCalendarMonthShape(2026, 1);
  assert.equal(february.firstDayOffset, 6);
  assert.equal(february.daysInMonth, 28);
  assert.equal(february.calendarDays.length, 34);
  assert.equal(february.calendarDays[6], 1);
  assert.equal(february.calendarDays.at(-1), 28);
  assert.equal(february.calendarRows, 5);

  const august = getCalendarMonthShape(2026, 7);
  assert.equal(august.firstDayOffset, 5);
  assert.equal(august.daysInMonth, 31);
  assert.equal(august.calendarDays.length, 36);
  assert.equal(august.calendarRows, 6);
});

test("countCalendarMonthWorkdays applies official days and personal overrides", () => {
  assert.equal(countCalendarMonthWorkdays(2026, 6, {}), 23);
  assert.equal(countCalendarMonthWorkdays(2026, 6, {
    "2026-07-05": true,
    "2026-07-06": false,
  }), 23);
  assert.equal(countCalendarMonthWorkdays(2026, 6, { "2026-07-06": false }), 22);
  assert.equal(countCalendarMonthWorkdays(2026, 6, { "2026-07-05": true }), 24);
});

test("calculateAnnualWorkdays returns twelve monthly counts and their exact total", () => {
  const result = calculateAnnualWorkdays(2026, {});
  assert.equal(result.monthlyWorkdays.length, 12);
  assert.deepEqual(result.monthlyWorkdays, [21, 16, 22, 21, 19, 21, 23, 21, 22, 18, 21, 23]);
  assert.equal(result.totalWorkdays, 248);
  assert.equal(result.totalWorkdays, result.monthlyWorkdays.reduce((sum, count) => sum + count, 0));

  const adjusted = calculateAnnualWorkdays(2026, { "2026-07-06": false });
  assert.equal(adjusted.monthlyWorkdays[6], 22);
  assert.equal(adjusted.totalWorkdays, 247);
});

test("getWorkdayToggle preserves previous value and override-key existence", () => {
  assert.deepEqual(getWorkdayToggle(2026, 6, 6, {}), {
    date: "2026-07-06",
    hadOverride: false,
    previous: true,
    next: false,
  });
  assert.deepEqual(getWorkdayToggle(2026, 6, 5, { "2026-07-05": false }), {
    date: "2026-07-05",
    hadOverride: true,
    previous: false,
    next: true,
  });
});
