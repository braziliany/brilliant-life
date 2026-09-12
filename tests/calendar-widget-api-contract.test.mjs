import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarWidgetMethodNotAllowed,
  handleCalendarWidgetGet,
} from "../app/features/calendar/widget-api.ts";
import {
  CALENDAR_WIDGET_SCHEMA_VERSION,
  buildCalendarWidgetDto,
  getAllowedCalendarWidgetMonths,
  getShanghaiToday,
  validateCalendarWidgetMonth,
} from "../app/features/calendar/widget-contract.ts";

const now = new Date("2026-09-12T16:30:00.000Z");
const authorized = () => true;
const request = (query = "month=2026-09") => new Request(`https://pulse.sophier.org/api/v1/calendar/widget?${query}`);

test("Shanghai time owns today and the current/adjacent month range", () => {
  assert.equal(getShanghaiToday(now), "2026-09-13");
  assert.deepEqual(getAllowedCalendarWidgetMonths(now), ["2026-08", "2026-09", "2026-10"]);
});

test("month validation rejects missing, malformed, impossible, repeated, and out-of-range values", () => {
  for (const query of ["", "month=x", "month=2026-00", "month=2026-13", "month=2026-9", "month=2026-09&month=2026-10", "month=2025-09"]) {
    assert.equal(validateCalendarWidgetMonth(new URLSearchParams(query), now).ok, false, query);
  }
  assert.deepEqual(validateCalendarWidgetMonth(new URLSearchParams("month=2026-09"), now), { ok: true, month: "2026-09" });
});

test("DTO contains every date once, ordered, and exposes only explicit Calendar facts", () => {
  const dto = buildCalendarWidgetDto({
    month: "2026-09",
    overrides: { "2026-09-14": false, "2026-09-26": true },
    note: { scheduleNote: " schedule ", leaveNote: "  ", overtimeNote: "overtime" },
    now,
  });
  assert.equal(dto.schemaVersion, CALENDAR_WIDGET_SCHEMA_VERSION);
  assert.equal(dto.month, "2026-09");
  assert.equal(dto.timeZone, "Asia/Shanghai");
  assert.equal(dto.today, "2026-09-13");
  assert.equal(dto.generatedAt, now.toISOString());
  assert.equal(dto.officialCalendarConfigured, true);
  assert.equal(dto.days.length, 30);
  assert.deepEqual(dto.days.map((day) => day.date), Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`));
  assert.equal(new Set(dto.days.map((day) => day.date)).size, 30);

  const byDate = Object.fromEntries(dto.days.map((day) => [day.date, day]));
  assert.equal(byDate["2026-09-01"].isOfficialWorkday, true);
  assert.equal(byDate["2026-09-06"].isOfficialWorkday, false);
  assert.equal(byDate["2026-09-20"].isMakeupWorkday, true);
  assert.equal(byDate["2026-09-20"].isWorkday, true);
  assert.equal(byDate["2026-09-25"].isHoliday, true);
  assert.equal(byDate["2026-09-25"].holidayName, "中秋");
  assert.equal(byDate["2026-09-14"].personalOverride, "restday");
  assert.equal(byDate["2026-09-14"].isWorkday, false);
  assert.equal(byDate["2026-09-26"].personalOverride, "workday");
  assert.equal(byDate["2026-09-26"].isWorkday, true);
  assert.equal(byDate["2026-09-15"].personalOverride, null);
  assert.deepEqual(dto.notesSummary, { hasScheduleNote: true, hasLeaveNote: false, hasOvertimeNote: true });

  const serialized = JSON.stringify(dto);
  for (const forbidden of ["scheduleNote", "leaveNote", "overtimeNote", "updatedAt", "salary", "health", "finance", "career", "accessJwt"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(Object.hasOwn(dto.days[0], "id"), false);
});

test("unconfigured official year is explicit while safe weekday facts remain available", () => {
  const dto = buildCalendarWidgetDto({ month: "2027-01", overrides: {}, now: new Date("2026-12-31T16:05:00Z") });
  assert.equal(dto.officialCalendarConfigured, false);
  assert.equal(dto.days.length, 31);
});

test("notes summary uses trim/empty semantics without returning raw text", () => {
  const cases = [
    [undefined, [false, false, false]],
    [{ scheduleNote: "x" }, [true, false, false]],
    [{ leaveNote: "x" }, [false, true, false]],
    [{ overtimeNote: "x" }, [false, false, true]],
  ];
  for (const [note, expected] of cases) {
    const dto = buildCalendarWidgetDto({ month: "2026-09", overrides: {}, note, now });
    assert.deepEqual(Object.values(dto.notesSummary), expected);
    assert.equal(JSON.stringify(dto).includes('"x"'), false);
  }
});

test("GET is authorized, validates before storage, and returns private no-store JSON", async () => {
  let loads = 0;
  const loadMonth = async () => { loads += 1; return { overrides: {} }; };
  const response = await handleCalendarWidgetGet(request(), { authorize: authorized, now: () => now, loadMonth });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.match(response.headers.get("Content-Type"), /^application\/json/);
  assert.equal((await response.json()).month, "2026-09");
  assert.equal(loads, 1);

  for (const url of [request(""), request("month=2026-13"), request("month=2025-09"), request("month=2026-09&month=2026-10")]) {
    const rejected = await handleCalendarWidgetGet(url, { authorize: authorized, now: () => now, loadMonth });
    assert.equal(rejected.status, 400);
  }
  assert.equal(loads, 1);
});

test("unauthorized GET is denied and non-GET methods are always 405", async () => {
  const denied = await handleCalendarWidgetGet(request(), {
    authorize: () => false,
    now: () => now,
    async loadMonth() { throw new Error("must not load"); },
  });
  assert.equal(denied.status, 401);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = calendarWidgetMethodNotAllowed();
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("Allow"), "GET");
  }
});
