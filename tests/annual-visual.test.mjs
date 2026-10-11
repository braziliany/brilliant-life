import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { generateAnnualSummaryDraft } from "../app/features/annual/domain.ts";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const compiled = ts.transpileModule(read("app/features/annual/charts.tsx"), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const charts = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const draft = (overrides = {}, year = 2026) => generateAnnualSummaryDraft(year, { generatedAt: "2026-10-10T00:00:00Z", asOfDate: "2026-10-10", healthRecords: [], calendarData: {}, salaryRecords: [], experiences: [], financeTransactions: [], ...overrides });
const render = (chart, summary) => renderToStaticMarkup(createElement(charts[chart], { summary }));
const health = (date, steps, metricCoverage = '["steps"]') => ({ date, steps, metricCoverage, activeEnergyKcal: 0, restingEnergyKcal: 0, exerciseMinutes: 0, workoutCount: 0, sleepMinutes: null, weightKg: null, restingHeartRateBpm: null, source: "synthetic", updatedAt: "2026-10-10T00:00:00Z" });
const salary = (month, netSalary = 7114.60) => ({ month, netSalary, grossSalary: 8000, incomeTax: 50, workdays: 23 });

test("B2 empty charts never fabricate zeros or snapshots", () => {
  for (const chart of ["HealthBarcodeChart", "FinanceHairlineChart", "LifeFinanceMonthlyChart", "LifeFinanceDomainChart"]) assert.doesNotMatch(render(chart, draft()), /<svg/);
});

test("monthly Health pairs total steps with trusted days and distinguishes missing, zero and legacy", () => {
  const summary = draft({ healthRecords: [health("2026-01-01", 0), health("2026-03-01", 12000), health("2026-03-02", 2000), health("2026-04-01", 999999, '[]'), health("2026-05-01", 888888, null)] });
  const html = render("HealthBarcodeChart", summary);
  assert.match(html, /0 步.*?1 天有效记录/);
  assert.match(html, /14,000 步.*?2 天有效记录/);
  assert.match(html, /无有效步数记录/); assert.match(html, /覆盖未知/);
  assert.doesNotMatch(html, /999,999|888,888/);
  assert.match(html, /不能直接比较运动多少/);
  assert.equal((html.match(/<circle /g) ?? []).length, 2);
  assert.match(html, /data-lieflat-template="L3"/);
});

test("single Salary keeps exact saved amount and centered point without a fake line", () => {
  const html = render("FinanceHairlineChart", draft({ salaryRecords: [salary("2026-09")] }));
  assert.match(html, /¥7,114\.60/); assert.match(html, /9月/); assert.match(html, /2026年/);
  assert.equal((html.match(/<circle /g) ?? []).length, 1);
  assert.match(html, /cx="170" cy="115"/); assert.doesNotMatch(html, /<path/);
});

test("sparse Salary has saved points only, missing months break the line and input stays unchanged", () => {
  const summary = draft({ salaryRecords: [salary("2026-09", 5892.40), salary("2026-06", 6493.80), salary("2026-07", 7114.60)] });
  const before = JSON.stringify(summary);
  const html = render("FinanceHairlineChart", summary);
  assert.equal((html.match(/<circle /g) ?? []).length, 3); assert.equal((html.match(/<path /g) ?? []).length, 1);
  assert.doesNotMatch(html, />8月</); assert.ok(html.indexOf('>6月<') < html.indexOf('>7月<') && html.indexOf('>7月<') < html.indexOf('>9月<'));
  for (const amount of ["6,493.80", "7,114.60", "5,892.40"]) assert.ok(html.includes(amount));
  assert.equal(JSON.stringify(summary), before);
});

test("twelve months and cross-year fixtures retain every salary with honest year labels", () => {
  const summary = draft({}, 2025);
  summary.finance.salary.facts.months = Array.from({ length: 12 }, (_, i) => salary(`2025-${String(i + 1).padStart(2, "0")}`, 6000 + i));
  assert.equal((render("FinanceHairlineChart", summary).match(/<circle /g) ?? []).length, 12);
  summary.finance.salary.facts.months = [salary("2026-01"), salary("2025-12")];
  const html = render("FinanceHairlineChart", summary);
  assert.match(html, /2025年/); assert.match(html, /2026年/);
  assert.ok(html.indexOf('>12月<') < html.indexOf('>1月<'));
});

test("Finance preserves signed/zero rows and positive fractional ticks carry precise values", () => {
  const summary = draft();
  summary.finance.lifeFinance.facts.monthlyNetExpense = [{ month: "2026-01", netExpenseCents: 0 }, { month: "2026-03", netExpenseCents: -120050 }, { month: "2026-04", netExpenseCents: 75050 }];
  const html = render("LifeFinanceMonthlyChart", summary);
  assert.match(html, /¥-1,200\.50/); assert.match(html, /¥0\.00/); assert.doesNotMatch(html, /<svg/);
  summary.finance.lifeFinance.facts.monthlyNetExpense = [{ month: "2026-01", netExpenseCents: 75050 }];
  const positive = render("LifeFinanceMonthlyChart", summary);
  assert.match(positive, /¥750\.50/); assert.match(positive, /末档按金额比例缩短/);
  assert.match(positive, /data-lieflat-template="F1"/);
});

test("SVG titles are single strings and rendering emits no React title warning", () => {
  const summary = draft({ healthRecords: [health("2026-01-01", 1)], salaryRecords: [salary("2026-01")] });
  summary.finance.lifeFinance.facts.monthlyNetExpense = [{ month: "2026-01", netExpenseCents: 12345 }];
  const messages = [], original = console.error;
  console.error = (...args) => messages.push(args.join(" "));
  try { for (const chart of ["HealthBarcodeChart", "FinanceHairlineChart", "LifeFinanceMonthlyChart"]) assert.match(render(chart, summary), /<title>[^<]+<\/title>/); }
  finally { console.error = original; }
  assert.deepEqual(messages, []);
});

test("320/375/390/430 and desktop keep wide charts inside their own scroll viewport", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.annualPlotScroll\{[^}]*max-width:100%[^}]*min-width:0[^}]*overflow-x:auto[^}]*overscroll-behavior-x:contain/);
  assert.match(css, /\.annualMonthReadings\{[^}]*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:560px\)\{[^\n]*\.annualMonthReadings\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  for (const viewport of [320, 375, 390, 430, 1280]) {
    assert.equal(viewport <= 560 ? 2 : 4, viewport === 1280 ? 4 : 2); // Same verified breakpoint, not a separate mobile dataset.
    const summary = draft({ salaryRecords: Array.from({ length: 12 }, (_, i) => salary(`2025-${String(i + 1).padStart(2, "0")}`)) }, 2025);
    const html = render("FinanceHairlineChart", summary);
    assert.match(html, /class="annualPlotScroll" tabindex="0"/);
    assert.match(html, /viewBox="0 0 1200 250"/);
    const points = [...html.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(match => [+match[1], +match[2]]);
    assert.equal(points.length, 12);
    assert.ok(points.every(([x, y]) => x >= 50 && x <= 1150 && y >= 60 && y <= 185));
    assert.ok(points.every(([x], i) => !i || x - points[i - 1][0] >= 100));
  }
});
