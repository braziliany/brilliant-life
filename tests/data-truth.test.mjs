import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateHealthTrend, getRecentHealthDateKeys, healthIngestionShanghaiDate, healthCsvRows, readableHealthMetric } from "../app/features/health/domain.ts";
import { summarizeLifeFinance } from "../app/features/finance/domain.ts";
import { generateAnnualSummaryDraft } from "../app/features/annual/domain.ts";

const health = (overrides = {}) => ({ date: "2026-10-07", steps: 0, activeEnergyKcal: 0, restingEnergyKcal: 0, exerciseMinutes: 0, workoutCount: 0, weightKg: null, sleepMinutes: null, restingHeartRateBpm: null, metricCoverage: "[]", source: "synthetic", updatedAt: "2026-10-07T00:00:00Z", ...overrides });

test("Health shared coverage preserves explicit zero, excludes missing and annotates legacy observations", () => {
  for (const metric of ["steps", "activeEnergyKcal", "exerciseMinutes"]) {
    const records = [health({ date: "2026-10-05", [metric]: 999 }), health({ date: "2026-10-06", metricCoverage: JSON.stringify([metric]) }), health({ [metric]: 100, metricCoverage: null })];
    const trend = calculateHealthTrend(records, 7, metric, "2026-10-07");
    assert.equal(trend.metricHistory.length, 2);
    assert.equal(trend.metricAverage, 50);
    assert.equal(trend.unknownCoverageDays, 1);
    assert.equal(readableHealthMetric(health({ metricCoverage: null }), metric), null);
    assert.equal(calculateHealthTrend([health()], 7, metric, "2026-10-07").metricAverageLabel, "—");
  }
});

test("natural 7/30 day windows cross month/year boundaries without synthesizing missing dates", () => {
  assert.equal(healthIngestionShanghaiDate("2026-12-31T16:00:00Z"), "2027-01-01");
  assert.equal(healthIngestionShanghaiDate("2026-12-31T15:59:59Z"), "2026-12-31");
  for (const days of [7, 30]) {
    const dates = getRecentHealthDateKeys("2027-01-01", days);
    assert.equal(dates.length, days);
    const before = new Date(`${dates[0]}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    const records = [before.toISOString().slice(0, 10), dates[0], dates.at(-1), "2027-01-02"].map((date) => health({ date, metricCoverage: '["steps"]' }));
    const trend = calculateHealthTrend(records.reverse(), days, "steps", "2027-01-01");
    assert.deepEqual(trend.metricHistory.map((row) => row.date), [dates[0], "2027-01-01"]);
    assert.equal(trend.metricAverage, 0);
  }
  const route = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /gte\(healthDaily.date, start\)/);
  assert.match(route, /lte\(healthDaily.date, today\)/);
  assert.doesNotMatch(route, /limit\(days\)/);
  assert.match(route, /days === 1[\s\S]*?limit\(1\)/, "default latest-record read remains unchanged");
});

test("CSV leaves missing/unknown zero blank and requires both energy components", () => {
  const [missing, zero, legacy, partial, known] = healthCsvRows([
    health({ steps: 888, activeEnergyKcal: 123 }),
    health({ metricCoverage: '["steps","activeEnergyKcal","restingEnergyKcal"]' }),
    health({ metricCoverage: null, restingEnergyKcal: 1000 }),
    health({ metricCoverage: '["activeEnergyKcal"]', activeEnergyKcal: 50, restingEnergyKcal: 1000 }),
    health({ metricCoverage: '["activeEnergyKcal","restingEnergyKcal"]', activeEnergyKcal: 50, restingEnergyKcal: 1000 }),
  ]);
  assert.equal(missing[1], ""); assert.equal(missing[4], "");
  assert.equal(zero[1], 0); assert.equal(zero[4], 0);
  assert.equal(legacy[1], ""); assert.equal(legacy[3], 1000); assert.equal(legacy[4], "");
  assert.match(legacy.at(-1), /覆盖未知/);
  assert.equal(partial[4], ""); assert.equal(known[4], 1050);
});

const tx = (id, type, amountCents, lifeDomain = "food") => ({ id, source: "qianji", sourceId: `synthetic-${id}`, occurredAt: "2026-10-01T12:00:00+08:00", type, amountCents, currency: "CNY", rawType: type, rawCategory: "", rawSubcategory: "", accountFrom: "", accountTo: "", note: "", tags: [], lifeDomain, lifeDomainOverride: null, semanticNote: "", personId: null, projectId: null, assetId: null, eventId: null, placeId: null });

test("Finance net keeps positive/zero/negative categories and original accounting", () => {
  for (const refund of [0, 1000, 1500]) {
    const rows = [tx(1, "expense", 1000), tx(2, "refund", refund)];
    const summary = summarizeLifeFinance(rows, 2026, "2026-10-07");
    assert.equal(summary.expenseCents, 1000); assert.equal(summary.refundCents, refund);
    assert.equal(summary.netExpenseCents, 1000 - refund);
    assert.equal(summary.domains[0].amountCents, 1000 - refund);
    assert.equal(summary.monthly[0].netExpenseCents, 1000 - refund);
    assert.equal(summary.transactionCount, 2);
  }
  const summary = summarizeLifeFinance([tx(1, "expense", 1000), tx(2, "refund", 500, "digital")], 2026, "2026-10-07");
  assert.deepEqual(summary.domains.map((item) => item.amountCents), [1000, -500]);
  assert.ok(summary.domains.every((item) => item.ratio === 0));
});

// Render the real Annual components without writing transpiled fixtures to disk.
const compiled = ts.transpileModule(readFileSync(new URL("../app/features/annual/charts.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const charts = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Annual negative month/categories render signed amounts, never positive rungs or percentages", () => {
  const summary = generateAnnualSummaryDraft(2026, { generatedAt: "2026-10-07T00:00:00Z", asOfDate: "2026-10-07", healthRecords: [], calendarData: {}, salaryRecords: [], experiences: [], financeTransactions: [tx(1, "expense", 1000), tx(2, "refund", 1500, "digital")] });
  assert.equal(summary.finance.lifeFinance.facts.netExpenseCents, -500);
  const month = renderToStaticMarkup(createElement(charts.LifeFinanceMonthlyChart, { summary }));
  const domains = renderToStaticMarkup(createElement(charts.LifeFinanceDomainChart, { summary }));
  assert.match(month, /-5\.00/); assert.doesNotMatch(month, /<svg/);
  assert.match(domains, /-15\.00/); assert.match(domains, /10\.00/);
  assert.doesNotMatch(domains, /<svg|\d+\.\d+%/);
});

test("Annual zero net/category remains present without a percent or fake positive mark", () => {
  const summary = generateAnnualSummaryDraft(2026, { generatedAt: "2026-10-07T00:00:00Z", asOfDate: "2026-10-07", healthRecords: [], calendarData: {}, salaryRecords: [], experiences: [], financeTransactions: [tx(1, "expense", 1000), tx(2, "refund", 1000)] });
  const markup = renderToStaticMarkup(createElement(charts.LifeFinanceDomainChart, { summary }));
  assert.match(markup, /¥0\.00/); assert.doesNotMatch(markup, /\d+\.\d+%/);
  assert.equal(summary.finance.lifeFinance.facts.domainDistribution.length, 1);
});
