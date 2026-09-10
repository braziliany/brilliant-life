import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildSalaryTrendPoints } from "../app/features/salary/trend.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const dashboard = read("app/features/salary/SalaryDashboard.tsx");
const page = read("app/page.tsx");
const styles = read("app/globals.css");

const salary = (month, netSalary) => ({
  month,
  netSalary,
  workdays: 20,
  dailyRate: 275,
  grossSalary: netSalary + 100,
  deductions: 100,
  taxThreshold: 5000,
  taxRate: 3,
  taxableIncome: 0,
  extraIncome: 0,
  bonus: 0,
  leaveDeduction: 0,
  incomeTax: 0,
});

test("empty salary history produces no trend points", () => {
  assert.deepEqual(buildSalaryTrendPoints([]), []);
});

test("one saved salary month stays exact and renders as one centered point", () => {
  const points = buildSalaryTrendPoints([salary("2026-07", 7114.6)]);
  assert.deepEqual(points.map(({ month, value, x }) => ({ month, value, x })), [
    { month: "2026-07", value: 7114.6, x: 50 },
  ]);
});

test("multiple saved snapshots are chronological without synthesizing missing months", () => {
  const input = [salary("2026-09", 7000), salary("2026-06", 6493.8), salary("2026-07", 7114.6)];
  const points = buildSalaryTrendPoints(input);
  assert.deepEqual(points.map(({ month, value }) => ({ month, value })), [
    { month: "2026-06", value: 6493.8 },
    { month: "2026-07", value: 7114.6 },
    { month: "2026-09", value: 7000 },
  ]);
  assert.deepEqual(input.map(({ month }) => month), ["2026-09", "2026-06", "2026-07"]);
});

test("salary history is one saved-final-salary line with no legend or component series", () => {
  assert.match(dashboard, /buildSalaryTrendPoints\(salaryRecords\)/);
  assert.match(dashboard, /<polyline className="salaryTrendLine"/);
  assert.match(dashboard, /salaryTrendPoint[\s\S]*point\.value/);
  assert.doesNotMatch(dashboard, /trendLegend|grossBar|deductionBar|taxBar|netBar|grossKey|deductionKey|taxKey|netKey/);
  assert.doesNotMatch(page, /salaryTrendMax|slice\(-6\)/);
});

test("salary trend stays compact and width-safe on mobile", () => {
  assert.match(styles, /\.salaryLinePlot\{[^}]*height:112px/);
  assert.match(styles, /\.salaryTrendMonths\{display:grid;min-width:0/);
  assert.match(styles, /@media \(max-width:560px\)[^\n]*\.salaryTrend\{padding:8px 12px 4px\}\.salaryLinePlot\{height:96px\}/);
  assert.doesNotMatch(styles, /\.salaryTrend[^\n]*(overflow-x:auto|overflow-x:scroll)/);
});
