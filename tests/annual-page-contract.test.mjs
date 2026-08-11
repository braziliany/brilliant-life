import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const page = read("app/features/annual/AnnualReportPage.tsx");
const charts = read("app/features/annual/charts.tsx");
const styles = read("app/globals.css");
const annualApi = read("app/api/annual/route.ts");
const implementationRecord = read("docs/v1.5-Sprint-10-年度报告页面实施记录.md");

test("annual page declares AnnualSummaryDraft as its only factual payload", () => {
  assert.match(page, /data-annual-summary-source="AnnualSummaryDraft"/);
  assert.match(page, /fetch\(`\/api\/annual\?year=\$\{year\}`/);
  assert.match(annualApi, /generateAnnualSummaryDraft\(year/);
  assert.doesNotMatch(page + charts, /calculateSalary|calculateAnnualWorkdays|resolveCalendarDay/);
});

test("annual page preserves in-progress, missing finance, and empty career states", () => {
  assert.match(page, /\{summary\.year\} 年记录/);
  assert.match(page, /summary\.finance\.coverage\.availableMonths \? money/);
  assert.match(charts, /缺失月份断开且不补 ¥0/);
  assert.match(page, /这一年没有与之重叠的职业经历记录/);
  assert.match(page, /年份未配置/);
});

test("annual report uses exactly four audited Lieflat templates in porcelain", () => {
  assert.match(page, /data-chart-count="4"/);
  assert.match(page, /data-color-system="porcelain"/);
  assert.match(implementationRecord, /模板编号：L3/);
  assert.match(implementationRecord, /模板编号：F4/);
  assert.match(implementationRecord, /模板编号：F2/);
  assert.match(implementationRecord, /模板编号：L15/);
  assert.doesNotMatch(charts, /L3 BARCODE|F4 TICK|F2 HAIRLINE|L15 BALLOT|PORCELAIN ·/);
  assert.doesNotMatch(charts, /Chart\.js|echarts|Math\.random/);
});

test("annual UI consumes domain-defined YTD and full-year calendar semantics", () => {
  assert.match(page, /summary\.health\.coverage\.expectedDays/);
  assert.match(page, /summary\.health\.coverage\.fullYearExpectedDays/);
  assert.match(page + charts, /summary\.time\.coverage\.includesFutureDates/);
  assert.match(page, /summary\.finance\.coverage\.expectedMonths/);
  assert.doesNotMatch(page + charts, /new Date|Date\.parse|daysInYear|monthIndex/);
});

test("annual responsive contract keeps mobile charts readable and honors reduced motion", () => {
  assert.match(styles, /@media \(max-width:560px\)[\s\S]*\.annualChartCanvas svg/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.lieflatReveal,.lieflatDraw\{opacity:1;animation:none/);
});
