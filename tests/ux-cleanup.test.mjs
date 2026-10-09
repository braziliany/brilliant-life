import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { salaryTrendMonthLabel } from "../app/features/salary/trend-labels.ts";
import { buildSalaryTrendPoints } from "../app/features/salary/trend.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("app/components/home/HomePage.tsx");
const calendar = read("app/features/calendar/WorkCalendarCard.tsx");
const career = read("app/features/career/WorkExperienceTimeline.tsx");
const annual = read("app/features/annual/AnnualReportPage.tsx");
const insights = read("app/features/insights/domain.ts");
const salary = read("app/features/salary/SalaryDashboard.tsx");
const css = read("app/globals.css");

test("Home copy scopes health dates and removes duplicate workdays", () => {
  assert.match(home, /查看记录/);
  assert.doesNotMatch(home, /进入数据中心/);
  assert.match(home, /最近 30 天内有记录的日期/);
  assert.equal((home.match(/<span>本月工作<\/span>/g) ?? []).length, 1);
  assert.match(home, /healthLoadStatus === "ready" \? `\$\{healthHistoryDays\} 天` : "—"/);
});

test("Calendar notes explain explicit save without changing submit behavior", () => {
  assert.match(calendar, /修改后，请点击“保存备注”/);
  assert.doesNotMatch(calendar, /自动保存在/);
  assert.match(calendar, /onSubmit=\{onSaveNote\}/);
  assert.match(calendar, /calendarNoteStatus === "saving" \? "保存中…" : "保存备注"/);
});

test("salary presentation labels cover one, three, twelve and cross-year records", () => {
  for (const months of [["2026-09"], ["2026-06", "2026-07", "2026-09"], Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`), ["2026-11", "2026-12", "2027-01", "2027-03"]]) {
    const records = months.map((month, i) => ({ month, netSalary: 6000 + i * 10 }));
    const points = buildSalaryTrendPoints(records);
    assert.deepEqual(points.map(p => p.month), months);
    assert.deepEqual(points.map(p => p.value), records.map(r => r.netSalary));
    const labels = points.map((p, i) => salaryTrendMonthLabel(p.month, points[i - 1]?.month));
    assert.equal(labels[0], `${months[0].slice(0, 4)}年\n${Number(months[0].slice(5))}月`);
    assert.equal(labels.filter(l => l.includes("年")).length, new Set(months.map(m => m.slice(0, 4))).size);
    assert.ok(points.every(p => p.showMonth));
  }
  assert.equal(salaryTrendMonthLabel("2027-03", "2027-01"), "3月");
  assert.match(salary, /x1=\{point.x\} x2=\{point.x\}/);
  assert.match(salary, /minWidth: salaryTrendPoints.length >= 6 \? \(salaryTrendPoints.length - 1\) \* 76 \+ 48/);
  assert.match(salary, /left: `\$\{point.x\}%`/);
});

test("Annual and four Insights use observation and saved-record wording", () => {
  assert.doesNotMatch(annual + insights + read("app/features/annual/charts.tsx"), /实发|今年|截至今日|年初|生活之间发生了什么|导致|说明你更/);
  assert.match(annual, /最早与最新记录的工资相同/);
  assert.match(annual, /这一年的记录与比较/);
  assert.match(annual, /截至 \{summary.asOfDate\}/);
  assert.match(annual, /summary.insights.slice\(0, 4\)/);
});

test("Career expansion has an explicit purpose and no empty details control", () => {
  assert.match(career, /experience.summary && <button[^>]*experienceSummaryToggle/);
  assert.match(career, /aria-expanded=\{expanded\}/);
  assert.match(career, /查看工作内容/);
  assert.match(css, /\.experienceSummaryToggle\{display:none\}/);
});

test("mobile rules contain salary overflow locally and preserve hidden navigation", () => {
  assert.match(css, /\.salaryTrendViewport\{max-width:100%;min-width:0;overflow-x:auto/);
  assert.match(css, /\.salaryTrendMonths b\{[^}]*white-space:pre-line/);
  assert.match(css, /\.primaryNavigation\{display:none\}/);
  assert.match(css, /\.calendarNotesFooter button\{min-height:44px\}/);
});

test("real Salary chart renders one, three, twelve and cross-year saved snapshots", async () => {
  const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
    .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
  const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`;
  let source = salary.replace('"./SalaryHistoryEditor"', JSON.stringify(moduleUrl(read("app/features/salary/SalaryHistoryEditor.tsx"))));
  for (const name of ["history", "trend", "trend-labels"]) source = source.replace(`"./${name}"`, JSON.stringify(new URL(`../app/features/salary/${name}.ts`, import.meta.url).href));
  const { SalaryDashboard } = await import(moduleUrl(source));
  for (const months of [["2026-09"], ["2026-06", "2026-07", "2026-09"], Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`), ["2026-12", "2027-01", "2027-03"]]) {
    const records = months.map((month, i) => ({ month, netSalary: 6000 + i * 10, workdays: 20, grossSalary: 6200, deductions: 100, leaveDeduction: 0, incomeTax: 100, bonus: 0 }));
    const html = renderToStaticMarkup(createElement(SalaryDashboard, { active: true, monthLabel: "10月", calendarMonthKey: "2026-10", workdays: 20, dailyRate: 300, deductions: 100, taxThreshold: 5000, taxRate: 3, extraIncome: 0, bonus: 0, leaveDeduction: 0, grossSalary: 6000, taxableIncome: 900, incomeTax: 27, netSalary: 5873, salaryRecordMismatch: false, salaryStatus: "idle", salaryRecords: records, yearSavedMonths: records.length, yearTotalNetSalary: 0, yearTotalIncomeTax: 0, salaryLoadStatus: "ready", isCurrentCalendarMonth: true, holidayCalendarConfigured: true, money: value => value.toFixed(2) }));
    assert.equal((html.match(/class="salaryTrendAnchor"/g) ?? []).length, records.length);
    assert.equal((html.match(/class="salaryTrendPoint/g) ?? []).length, records.length);
    for (const point of buildSalaryTrendPoints(records)) {
      assert.ok(html.includes(`left:${point.x}%`));
      assert.ok(html.includes(`x1="${point.x}" x2="${point.x}"`));
      assert.ok(html.includes(`¥${point.value.toFixed(2)}`));
    }
    assert.match(html, /2026年\n/);
    if (months.includes("2027-01")) { assert.match(html, /2027年\n1月/); assert.doesNotMatch(html, />2月<\/b>/); }
    if (records.length === 12) assert.match(html, /min-width:884px/);
  }
});
