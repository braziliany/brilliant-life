import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { generateAnnualSummaryDraft } from "../app/features/annual/domain.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`;
const source = read("app/features/annual/AnnualReportPage.tsx")
  .replace('"./charts"', JSON.stringify(moduleUrl(read("app/features/annual/charts.tsx"))))
  .replace('"./domain"', JSON.stringify(new URL("../app/features/annual/domain.ts", import.meta.url).href));
const { AnnualArchiveContent } = await import(moduleUrl(source));
const input = overrides => ({ generatedAt: "2026-10-08T00:00:00Z", asOfDate: "2026-10-08", healthRecords: [], calendarData: {}, salaryRecords: [], experiences: [], financeTransactions: [], ...overrides });
const render = (overrides = {}, year = 2026) => renderToStaticMarkup(createElement(AnnualArchiveContent, { summary: generateAnnualSummaryDraft(year, input(overrides)), onChangeYear: () => {} }));
const section = (html, name) => html.split(`data-annual-section="${name}"`)[1].split('</section>')[0];
const health = overrides => ({ date: "2026-10-01", steps: 0, activeEnergyKcal: 0, restingEnergyKcal: 0, exerciseMinutes: 0, workoutCount: 0, sleepMinutes: null, weightKg: null, restingHeartRateBpm: null, metricCoverage: '["steps","exerciseMinutes"]', source: "synthetic", updatedAt: "2026-10-01T00:00:00Z", ...overrides });
const tx = (id, type, amountCents) => ({ id, source: "qianji", sourceId: `synthetic-${id}`, occurredAt: "2026-10-01T12:00:00+08:00", type, amountCents, currency: "CNY", rawType: type, rawCategory: "", rawSubcategory: "", accountFrom: "", accountTo: "", note: "", tags: [], lifeDomain: "food", lifeDomainOverride: null, semanticNote: "", personId: null, projectId: null, assetId: null, eventId: null, placeId: null });

test("actual Annual rendering orders facts before comparisons and closed coverage", () => {
  const html = render();
  const positions = ["health", "career", "salary", "life-finance", "time", "insights", "coverage"].map(name => html.indexOf(`data-annual-section="${name}"`));
  assert.ok(positions.every((position, i) => !i || position > positions[i - 1]));
  assert.match(html, /<details class="annualRecordDetails"><summary>记录说明与来源/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  const hero = html.split('</header>')[0];
  assert.doesNotMatch(hero, /累计工资|全年配置工作日|健康记录/);
});

test("empty domains are natural states and unavailable Insights are not empty cards", () => {
  const html = render({}, 2025);
  for (const text of ["暂无健康记录", "没有与之重叠的职业经历", "暂无已保存工资记录", "暂无财务记录", "年份未配置日历", "现有记录还不足以进行比较"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(section(html, "insights"), /<article/);
  assert.match(html, /职业经历不要求每个月都有新事件/);
});

test("Health preserves explicit zero, excludes missing and never promotes legacy aggregates", () => {
  const zero = section(render({ healthRecords: [health({})] }), "health");
  assert.match(zero, /已记录步数<\/span><strong>0<\/strong>/);
  assert.match(zero, /最新记录体重<\/span><strong>—<\/strong>/);
  const missing = section(render({ healthRecords: [health({ steps: 98765, metricCoverage: '[]' })] }), "health");
  assert.doesNotMatch(missing, /98,765/);
  const legacy = section(render({ healthRecords: [health({ steps: 98765, metricCoverage: null })] }), "health");
  assert.match(legacy, /天为早期记录/);
  assert.doesNotMatch(legacy, /98,765|<svg/);
});

test("one saved salary has one main total, real first observation and no estimated months", () => {
  const html = render({ salaryRecords: [{ month: "2026-09", workdays: 20, grossSalary: 6500, incomeTax: 500, netSalary: 6000 }] });
  const salary = section(html, "salary");
  assert.equal((salary.match(/累计工资/g) ?? []).length, 1);
  assert.match(salary, /¥6,000\.00/);
  assert.match(salary, /1 个已保存月份/);
  assert.doesNotMatch(html, /年初|预计工资<\/strong>/);
});

test("Finance negative and zero net remain signed while partial source dates stay explicit", () => {
  for (const refund of [1000, 1500]) {
    const finance = section(render({ financeTransactions: [tx(1, "expense", 1000), tx(2, "refund", refund)] }), "life-finance");
    assert.match(finance, refund === 1000 ? /净消费<\/span><strong>¥0\.00/ : /净消费<\/span><strong>¥-5\.00/);
    assert.match(finance, /支出<\/span><strong>¥10\.00/);
    assert.match(finance, /财务记录截至 10 月 1 日/);
    assert.doesNotMatch(finance, /累计工资/);
  }
});

test("current year is YTD, historical year ends at its own boundary and Time is configuration", () => {
  assert.match(render(), /进行中.*?截至 2026-10-08/);
  const historical = render({}, 2025);
  assert.match(historical, /已结束.*?2025-01-01 — 2025-12-31/);
  assert.doesNotMatch(historical, /截至今日|今年/);
  assert.match(section(render(), "time"), /全年日历配置，不代表已经完成/);
  assert.match(section(render(), "time"), /包含未来日期/);
});

test("Career uses month-precision year-clipped scope, not an invented employment date", () => {
  const html = render({ experiences: [{ id: 1, company: "合成公司", role: "合成岗位", startDate: "2025-06", endDate: null, summary: "", highlights: [] }] });
  assert.match(section(html, "career"), /年内记录范围 2026-01 — 2026-10/);
  assert.doesNotMatch(section(html, "career"), /入职日|离职日|2026-01-01/);
});

test("partial Health mixed with early records does not invent a first-of-year change", () => {
  const html = render({ healthRecords: [health({ date: "2026-06-01", steps: 100, weightKg: 60, metricCoverage: '["steps","weightKg"]' }), health({ date: "2026-10-01", steps: 200, weightKg: 61, metricCoverage: null })] });
  assert.match(section(html, "health"), /暂无可确认的汇总/);
  assert.doesNotMatch(section(html, "health"), /年初|增长|变化|<svg/);
});

test("mobile code keeps sections shrinkable, long amounts wrapping and source control tappable", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.annualHealth,\.annualSalary,\.annualTime\{min-width:0/);
  assert.match(css, /\.annualRecordDetails>summary\{[^}]*min-height:44px/);
  assert.match(css, /\.annualReport \.annualFacts strong,[^}]*overflow-wrap:anywhere/);
  assert.match(css, /@media \(max-width:560px\)[\s\S]*\.annualSectionHead h2[^}]*overflow-wrap:anywhere/);
});
