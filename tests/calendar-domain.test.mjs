import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarDateKey,
  getHolidayName,
  isMakeupWorkday,
  isOfficialWorkday,
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
