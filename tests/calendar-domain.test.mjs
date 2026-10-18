import assert from "node:assert/strict";
import test from "node:test";

import { calculateSalary } from "../app/api/salary/policy.ts";
import {
  calculateAnnualWorkdays,
  calendarDateKey,
  countCalendarMonthWorkdays,
  getHolidayName,
  getHolidayCalendar,
  getCalendarMonthShape,
  getWorkdayToggle,
  isMakeupWorkday,
  isOfficialWorkday,
  resolveCalendarDay,
  shiftCalendarMonth,
  summarizeCalendarMonthProgress,
  summarizeRecordedHours,
  formatRecordedHours,
  effectiveCalendarOverrides,
} from "../app/features/calendar/domain.ts";
import { summarizeCalendarYear } from "../app/features/annual/domain.ts";
import { buildCalendarWidgetDto } from "../app/features/calendar/widget-contract.ts";
import { parseWorkRecord, handleWorkRecordMutation, saveWorkRecord, removeWorkRecord } from "../app/features/calendar/work-record-service.ts";
import { calendarWorkRecords, calendarOverrides } from "../db/schema.ts";
import { Miniflare } from "miniflare";
import { drizzle } from "drizzle-orm/d1";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCalendarDayView } from "../app/features/calendar/day-view.ts";

test("date presentation maps final work/rest independently of Today and preserves all source facts", () => {
  const cases = [
    { date: "2026-10-12", work: true },
    { date: "2026-10-17", work: false },
    { date: "2026-10-01", work: false },
    { date: "2026-10-10", work: true },
    { date: "2026-10-01", plan: true, work: true },
    { date: "2026-10-10", plan: false, work: false },
    { date: "2026-10-01", plan: false, record: { worked: true, hours: 8 }, work: true },
    { date: "2026-10-12", plan: true, record: { worked: false, hours: 0 }, work: false },
    { date: "2026-10-18", plan: false, record: { worked: true, hours: null }, work: true },
  ];
  for (const scenario of cases) {
    const [year, month, day] = scenario.date.split("-").map(Number);
    const overrides = Object.hasOwn(scenario, "plan") ? { [scenario.date]: scenario.plan } : {};
    const records = scenario.record ? { [scenario.date]: scenario.record } : {};
    const inputs = structuredClone({ overrides, records });
    const before = resolveCalendarDay(year, month - 1, day, overrides, records);
    const workdaysBefore = countCalendarMonthWorkdays(year, month - 1, overrides, records);
    assert.equal(before.workday, scenario.work, scenario.date);
    for (const todayKey of [scenario.date, "2027-01-01"]) {
      const view = buildCalendarDayView({ year, month: month - 1, day, todayKey, overrides, records, editing: true, busy: false });
      assert.equal(view.className, `${scenario.work ? "workday" : "weekend"}${todayKey === scenario.date ? " today" : ""} editable`);
      assert.equal(view.key, scenario.date);
      assert.equal(view.holiday, before.holiday, "official holiday fact is not replaced by the final state");
      assert.equal(view.disabled, false);
      if (before.makeup) assert.match(view.ariaLabel, /官方调休上班/);
      if (before.holiday) assert.ok(view.ariaLabel.includes(before.holiday));
      if (Object.hasOwn(scenario, "plan")) assert.ok(view.ariaLabel.includes(`安排${scenario.plan ? "上班" : "休息"}`));
      if (scenario.record) {
        assert.ok(view.title.includes(scenario.record.worked ? "实际上班" : "实际未上班"));
        assert.ok(view.title.includes(scenario.record.hours === null ? "工时未知" : `${scenario.record.hours}小时`));
      }
    }
    assert.deepEqual({ overrides, records }, inputs);
    assert.deepEqual(resolveCalendarDay(year, month - 1, day, overrides, records), before);
    assert.equal(countCalendarMonthWorkdays(year, month - 1, overrides, records), workdaysBefore);
    const args = { year, month: month - 1, day, todayKey: scenario.date, overrides, records };
    assert.equal(buildCalendarDayView({ ...args, editing: false, busy: false }).disabled, true);
    assert.equal(buildCalendarDayView({ ...args, editing: true, busy: true }).disabled, true);
  }
});

test("date editor renders distinct plans, actual eight-hour shifts, unknown and zero hours", async () => {
  const source = readFileSync(new URL("../app/features/calendar/CalendarDateEditor.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
    .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
  const { CalendarDateEditor } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const render = (record, arrangement) => renderToStaticMarkup(createElement(CalendarDateEditor, { date: "2026-10-01", officialLabel: "国庆法定休假", arrangement, record, busy: false, onArrange: async () => {}, onRecord: async () => {}, onClose: () => {} }));
  const eightHours = render({ worked: true, hours: 8 }, false);
  for (const label of ["国庆法定休假", "我的安排", "上班", "休息", "默认", "实际上班", "工作时长", "保存安排", "保存记录"]) assert.ok(eightHours.includes(label), label);
  assert.match(eightHours, /value="8"/);
  assert.match(eightHours, /<input(?=[^>]*type="radio")(?=[^>]*value="rest")(?=[^>]*checked="")[^>]*>/);
  assert.doesNotMatch(eightHours, /个人修改|<option[^>]*>请假|<option[^>]*>其他安排/);
  assert.match(render({ worked: false, hours: 0 }, undefined), /value="0"/);
  assert.match(render({ worked: true, hours: null }, undefined), /value=""/);
  assert.match(render(undefined, undefined), /value="unknown" selected=""/);
});

test("actual eight-hour early shifts override rest calendars without changing official facts", () => {
  const records = { "2026-07-05": { worked: true, hours: 8 } };
  const day = resolveCalendarDay(2026, 6, 5, {}, records);
  assert.equal(day.workday, true);
  assert.equal(day.officialWorkday, false);
  assert.equal(countCalendarMonthWorkdays(2026, 6, {}, records), 24);
});

test("official, planned and actual states stay independent across all date classes", () => {
  for (const [date, official] of [["2026-07-06", true], ["2026-07-05", false], ["2026-10-01", false], ["2026-10-10", true]]) {
    const [year, month, day] = date.split("-").map(Number);
    const records = { [date]: { worked: true, hours: 8 } };
    const plans = { [date]: false };
    const resolved = resolveCalendarDay(year, month - 1, day, plans, records);
    assert.equal(resolved.officialWorkday, official, date);
    assert.equal(resolved.workday, true, date);
    assert.equal(plans[date], false);
    const progress = summarizeCalendarMonthProgress(year, month - 1, date, plans, records);
    assert.equal(progress.totalWorkdays, countCalendarMonthWorkdays(year, month - 1, plans, records));
    const annual = summarizeCalendarYear(year, { overrides: plans, workRecords: records });
    assert.equal(annual.facts.months[month - 1].workdays, progress.totalWorkdays);
    const dto = buildCalendarWidgetDto({ month: date.slice(0, 7), overrides: plans, workRecords: records, now: new Date(`${date}T00:00:00Z`) });
    assert.equal(dto.days[day - 1].isWorkday, true);
    assert.equal(dto.days[day - 1].isOfficialWorkday, official);
    assert.equal(dto.days[day - 1].personalOverride, "restday");
    assert.equal(resolveCalendarDay(year, month - 1, day, effectiveCalendarOverrides(plans, records)).workday, true);
    assert.deepEqual(summarizeRecordedHours(records, date.slice(0, 7)), { hours: 8, recordedDays: 1, knownHoursDays: 1 });
  }
  assert.equal(resolveCalendarDay(2026, 9, 10, { "2026-10-10": false }).workday, false);
  assert.equal(resolveCalendarDay(2026, 9, 10, {}).workday, true);
});

test("unknown hours, zero and absent records remain distinct across month and year boundaries", () => {
  const records = {
    "2026-12-31": { worked: true, hours: null },
    "2027-01-01": { worked: false, hours: 0 },
    "2027-01-02": { worked: true, hours: 8 },
  };
  assert.deepEqual(summarizeRecordedHours(records, "2026-12"), { hours: 0, recordedDays: 1, knownHoursDays: 0 });
  assert.deepEqual(summarizeRecordedHours(records, "2027-01"), { hours: 8, recordedDays: 2, knownHoursDays: 2 });
  assert.deepEqual(summarizeRecordedHours(records, "2026-11"), { hours: 0, recordedDays: 0, knownHoursDays: 0 });
  assert.equal(resolveCalendarDay(2027, 0, 1, {}, records).workday, false);
  assert.equal(resolveCalendarDay(2027, 0, 2, {}, records).workday, true);
  assert.equal(calculateAnnualWorkdays(2027, {}, records).monthlyWorkdays[0], countCalendarMonthWorkdays(2027, 0, {}, records));
});

test("recorded hour display adds canonical decimals without changing saved precision or numeric totals", () => {
  const recordsFor = (hours) => Object.fromEntries(hours.map((value, index) => [
    `2026-07-${String(index + 1).padStart(2, "0")}`, { worked: value !== 0, hours: value },
  ]));
  for (const [values, expected] of [
    [[0.1, 0.2], "0.3"],
    [[8], "8"],
    [[0.1, 0.2, 0.3, 1.25, 2.125], "3.975"],
    [[0], "0"],
    [[1.2345678901234567], "1.2345678901234567"],
    [[1.0000000000000002, 0.1], "1.1000000000000002"],
    [[1e-7, 2e-7], "0.0000003"],
    [[Number.MIN_VALUE], `0.${"0".repeat(323)}5`],
  ]) {
    const records = recordsFor(values);
    records["2026-07-30"] = { worked: true, hours: null };
    records["2026-08-01"] = { worked: true, hours: 24 };
    const before = structuredClone(records);
    const summary = summarizeRecordedHours(records, "2026-07");
    assert.equal(formatRecordedHours(records, "2026-07"), expected, String(values));
    assert.equal(summary.hours, values.reduce((sum, value) => sum + value, 0));
    assert.equal(summary.knownHoursDays, values.length);
    assert.deepEqual(records, before);
  }
  assert.equal(formatRecordedHours({}, "2026-07"), "0");
  assert.equal(formatRecordedHours(recordsFor([null]), "2026-07"), "0");
});

test("work record validation accepts eight hours without inventing a standard shift", () => {
  assert.deepEqual(parseWorkRecord({ date: "2026-10-01", worked: true, hours: 8 }), { date: "2026-10-01", worked: true, hours: 8 });
  assert.equal(parseWorkRecord({ date: "2026-10-01", worked: true }).hours, null);
  assert.equal(parseWorkRecord({ date: "2026-10-01", worked: false, hours: 0 }).hours, 0);
  for (const row of [null, [], { date: "2026-02-30", worked: true }, { date: "2026-10-01", worked: 1 }, ...[-1, 25, NaN, Infinity, "8", 0].map(hours => ({ date: "2026-10-01", worked: true, hours })), { date: "2026-10-01", worked: false, hours: 8 }, { date: "2026-10-01", worked: true, wage: 8 }]) assert.equal(parseWorkRecord(row), null);
});

test("actual work mutation authenticates and validates before storage, and preserves failure status", async () => {
  let calls = 0;
  const deps = { authorize: () => true, save: async value => { calls++; return value; }, remove: async () => { calls++; } };
  const req = (body, method = "PUT", extra = {}) => new Request("https://pulse.sophier.org/api/calendar-work", { method, headers: { "Content-Type": "application/json", Origin: "https://pulse.sophier.org", ...extra }, body: JSON.stringify(body) });
  const valid = { date: "2026-10-01", worked: true, hours: 8 };
  assert.equal((await handleWorkRecordMutation(req(valid), { ...deps, authorize: () => false })).status, 401);
  assert.equal((await handleWorkRecordMutation(req(valid, "PUT", { Origin: "https://evil.example" }), deps)).status, 403);
  assert.equal((await handleWorkRecordMutation(req(valid, "PUT", { Origin: "" }), deps)).status, 403);
  assert.equal((await handleWorkRecordMutation(req(valid, "PUT", { "Content-Type": "text/plain" }), deps)).status, 415);
  assert.equal((await handleWorkRecordMutation(req({ ...valid, hours: -1 }), deps)).status, 400);
  assert.equal(calls, 0);
  const saved = await handleWorkRecordMutation(req(valid), deps);
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await saved.json()).record, valid);
  assert.equal((await handleWorkRecordMutation(req({ date: valid.date }, "DELETE"), deps)).status, 200);
  assert.equal(calls, 2);
  assert.equal((await handleWorkRecordMutation(req(valid), { ...deps, save: async () => { throw Error("unavailable"); } })).status, 500);
});

test("real local D1 persists short shifts across reload, preserves historical plans and resets independently", { timeout: 30000 }, async () => {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  try {
    const d1 = await mf.getD1Database("DB");
    await d1.exec(readFileSync(new URL("../drizzle/0001_silly_infant_terrible.sql", import.meta.url), "utf8").replace(/--> statement-breakpoint/g, "").replace(/\s+/g, " "));
    await d1.exec(readFileSync(new URL("../drizzle/0015_romantic_bastion.sql", import.meta.url), "utf8").replace(/\s+/g, " "));
    const db = drizzle(d1);
    await db.insert(calendarOverrides).values({ date: "2026-10-01", isWorkday: false, updatedAt: "2020-01-01" });
    for (const date of ["2026-07-06", "2026-07-05", "2026-10-01", "2026-10-10"]) await saveWorkRecord(db, { date, worked: true, hours: 8 });
    const reloaded = drizzle(await mf.getD1Database("DB"));
    const records = Object.fromEntries((await reloaded.select().from(calendarWorkRecords)).map(row => [row.date, row]));
    assert.equal(records["2026-10-01"].hours, 8);
    assert.equal(resolveCalendarDay(2026, 9, 1, { "2026-10-01": false }, records).workday, true);
    assert.equal((await reloaded.select().from(calendarOverrides))[0].updatedAt, "2020-01-01");
    await reloaded.delete(calendarOverrides).where(eq(calendarOverrides.date, "2026-10-01"));
    assert.equal((await reloaded.select().from(calendarWorkRecords)).length, 4);
    await removeWorkRecord(db, "2026-10-01");
    const after = Object.fromEntries((await reloaded.select().from(calendarWorkRecords)).map(row => [row.date, row]));
    assert.equal(resolveCalendarDay(2026, 9, 1, {}, after).workday, false);
    await saveWorkRecord(db, { date: "2026-10-10", worked: false, hours: 0 });
    assert.equal((await reloaded.select().from(calendarWorkRecords).where(eq(calendarWorkRecords.date, "2026-10-10")))[0].hours, 0);
    await saveWorkRecord(db, { date: "2026-10-10", worked: true, hours: null });
    assert.equal((await reloaded.select().from(calendarWorkRecords).where(eq(calendarWorkRecords.date, "2026-10-10")))[0].hours, null);
  } finally { await mf.dispose(); }
});

test("calendarDateKey preserves zero-based month input and canonical output", () => {
  assert.equal(calendarDateKey(2026, 0, 1), "2026-01-01");
  assert.equal(calendarDateKey(2026, 6, 9), "2026-07-09");
  assert.equal(calendarDateKey(2026, 11, 31), "2026-12-31");
});

test("month progress keeps elapsed and future workdays inside the calendar domain", () => {
  const progress = summarizeCalendarMonthProgress(2026, 7, "2026-08-11", {});
  assert.equal(progress.totalWorkdays, countCalendarMonthWorkdays(2026, 7, {}));
  assert.equal(progress.elapsedWorkdays + progress.remainingWorkdays, progress.totalWorkdays);
  assert.ok(progress.elapsedWorkdays > 0);
  assert.ok(progress.remainingWorkdays > 0);
  assert.equal(summarizeCalendarMonthProgress(2026, 6, "2026-08-11", {}).remainingWorkdays, 0);
  assert.equal(summarizeCalendarMonthProgress(2026, 8, "2026-08-11", {}).elapsedWorkdays, 0);
});

test("holiday calendars are explicitly versioned and unconfigured years never masquerade as official", () => {
  const configured = getHolidayCalendar(2026);
  assert.equal(configured.status, "configured");
  assert.equal(configured.year, 2026);
  assert.equal(configured.holidayRanges.length, 7);
  assert.equal(configured.makeupWorkdays.size, 6);
  assert.deepEqual(getHolidayCalendar(2027), { status: "unconfigured", year: 2027 });
  assert.equal(getHolidayName("2027-01-01"), null);
  assert.equal(isMakeupWorkday("2027-01-03"), false);
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

test("July calendar workdays preserve the complete pre-refactor salary result", () => {
  const calendarWorkdays = countCalendarMonthWorkdays(2026, 6, {});

  assert.equal(calendarWorkdays, 23);
  assert.deepEqual(calculateSalary(calendarWorkdays), {
    dailyRate: 275,
    deductions: 130,
    taxThreshold: 5_000,
    taxRate: 3,
    extraIncome: 0,
    bonus: 0,
    leaveDeduction: 0,
    grossSalary: 6_325,
    taxableIncome: 1_195,
    incomeTax: 35.85,
    netSalary: 6_159.15,
  });
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
