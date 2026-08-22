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
const annualDomain = read("app/features/annual/domain.ts");
const implementationRecord = read("docs/v1.5-Sprint-10-年度报告页面实施记录.md");

test("annual page declares AnnualSummaryDraft as its only factual payload", () => {
  assert.match(page, /data-annual-summary-source="AnnualSummaryDraft"/);
  assert.match(page, /fetch\(`\/api\/annual\?year=\$\{year\}`/);
  assert.match(annualApi, /generateAnnualSummaryDraft\(year/);
  assert.match(annualApi, /\.from\(financeTransactions\)/);
  assert.match(annualApi, /financeTransactions: financeRows\.map\(toFinanceRecord\)/);
  assert.doesNotMatch(page + charts, /calculateSalary|calculateAnnualWorkdays|resolveCalendarDay/);
});

test("annual page preserves in-progress, independent finance, and empty career states", () => {
  assert.match(page, /\{summary\.year\} 年度档案 · \{periodLabel\}/);
  assert.match(page, /截至 \{summary\.asOfDate\}/);
  assert.doesNotMatch(page, /个人数字生命档案|实时草稿|AnnualSummaryDraft<|当前草稿|实时汇总|事实层|事实摘要/);
  assert.doesNotMatch(page, /\{summary\.calculationVersion\}/);
  assert.match(page, /summary\.finance\.salary\.coverage\.availableMonths \? money/);
  assert.match(page, /summary\.finance\.lifeFinance\.facts\.recordCount/);
  assert.match(page, /两类记录分别保存，不自动合计/);
  assert.match(charts, /缺失月份断开且不补 ¥0/);
  assert.match(page, /这一年没有与之重叠的职业经历记录/);
  assert.match(page, /年份未配置/);
});

test("annual report extends the audited Lieflat porcelain set without adding a chart library", () => {
  assert.match(page, /data-chart-count="6"/);
  assert.match(page, /data-color-system="porcelain"/);
  assert.match(implementationRecord, /模板编号：L3/);
  assert.match(implementationRecord, /模板编号：F4/);
  assert.match(implementationRecord, /模板编号：F2/);
  assert.match(implementationRecord, /模板编号：L15/);
  assert.match(charts, /data-lieflat-template="F1"/);
  assert.match(charts, /data-lieflat-template="F5"/);
  assert.doesNotMatch(charts, /L3 BARCODE|F4 TICK|F2 HAIRLINE|L15 BALLOT|PORCELAIN ·/);
  assert.doesNotMatch(charts, /Chart\.js|echarts|Math\.random/);
});

test("annual UI consumes domain-defined YTD and full-year calendar semantics", () => {
  assert.match(page, /summary\.health\.coverage\.expectedDays/);
  assert.match(page, /summary\.health\.coverage\.fullYearExpectedDays/);
  assert.match(page + charts, /summary\.time\.coverage\.includesFutureDates/);
  assert.match(page, /summary\.finance\.salary\.coverage\.expectedMonths/);
  assert.match(charts, /summary\.finance\.lifeFinance/);
  assert.doesNotMatch(page + charts, /new Date|Date\.parse|daysInYear|monthIndex/);
});

test("annual health keeps early records visible while explaining their lower confidence naturally", () => {
  assert.match(page, /coverage\.legacyUnknownDays/);
  assert.match(page, /天为早期记录/);
  assert.doesNotMatch(page, /legacy unknown|coverage protocol|旧协议/i);
  assert.match(annualDomain, /部分早期健康记录缺少指标级同步信息/);
});

test("annual responsive contract keeps mobile charts readable and honors reduced motion", () => {
  assert.match(styles, /@media \(max-width:560px\)[\s\S]*\.annualChartCanvas svg/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.lieflatReveal,.lieflatDraw\{opacity:1;animation:none/);
  assert.match(styles, /\.annualFinanceSources\{grid-template-columns:1fr\}/);
  assert.match(styles, /\.annualLifeFinanceMetrics\{gap:7px\}/);
});
