import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildSalaryTrendAreaPath, buildSalaryTrendPath, buildSalaryTrendPoints } from "../app/features/salary/trend.ts";
import { mergeSavedSalaryRecord, salaryInputFromRecord } from "../app/features/salary/history.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const dashboard = read("app/features/salary/SalaryDashboard.tsx");
const editor = read("app/features/salary/SalaryHistoryEditor.tsx");
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
  assert.deepEqual(points.map(({ month, value, x, y, showMonth }) => ({ month, value, x, y, showMonth })), [
    { month: "2026-07", value: 7114.6, x: 50, y: 50, showMonth: true },
  ]);
});

test("multiple saved salaries use a padded dynamic domain centered on their real range", () => {
  const points = buildSalaryTrendPoints([
    salary("2026-09", 5892.4),
    salary("2026-06", 6493.8),
    salary("2026-07", 7114.6),
  ]);
  assert.deepEqual(points.map(({ month, value }) => ({ month, value })), [
    { month: "2026-06", value: 6493.8 },
    { month: "2026-07", value: 7114.6 },
    { month: "2026-09", value: 5892.4 },
  ]);
  const highest = points.find((point) => point.value === 7114.6);
  const lowest = points.find((point) => point.value === 5892.4);
  assert.ok(highest.y > 10 && highest.y < 50, "highest salary keeps upper padding");
  assert.ok(lowest.y > 50 && lowest.y < 90, "lowest salary keeps lower padding");
  assert.ok(Math.abs((highest.y + lowest.y) / 2 - 50) < 0.000001, "salary range is visually centered");
});

test("equal and near-equal salaries remain visually stable", () => {
  const equal = buildSalaryTrendPoints([salary("2026-06", 6000), salary("2026-07", 6000)]);
  assert.deepEqual(equal.map(({ y }) => y), [50, 50]);

  const nearEqual = buildSalaryTrendPoints([salary("2026-06", 6000), salary("2026-07", 6001)]);
  assert.ok(nearEqual.every((point) => point.y > 49 && point.y < 51));
  assert.ok(Math.abs(nearEqual[0].y - nearEqual[1].y) < 1, "a one-yuan change is not exaggerated");
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
  assert.match(dashboard, /salaryTrendPoints\.length > 1 && <path className="salaryTrendArea"/);
  assert.match(dashboard, /salaryTrendPoints\.length > 1 && <path className="salaryTrendLine"/);
  assert.match(dashboard, /salaryTrendPoint[\s\S]*point\.value/);
  assert.doesNotMatch(dashboard, /trendLegend|grossBar|deductionBar|taxBar|netBar|grossKey|deductionKey|taxKey|netKey/);
  assert.doesNotMatch(page, /salaryTrendMax|slice\(-6\)/);
});

test("salary trend uses a smooth real-value path with an area guide", () => {
  const points = buildSalaryTrendPoints([
    salary("2026-06", 6493.8),
    salary("2026-07", 7114.6),
    salary("2026-09", 5892.4),
  ]);
  assert.match(buildSalaryTrendPath(points), /^M [\d.]+ [\d.]+ C /);
  assert.match(buildSalaryTrendAreaPath(points), / L 91 90 L 9 90 Z$/);
  assert.match(styles, /\.salaryTrendArea\{fill:var\(--lime\);fill-opacity:\.13/);
  assert.match(styles, /\.salaryTrendGuide\{stroke:var\(--line\)/);
});

test("salary history omits extra income presentation but keeps its calculation concept", () => {
  const history = dashboard.slice(dashboard.indexOf('<div className="salaryHistory">'));
  assert.doesNotMatch(history, /额外收入/);
  assert.match(dashboard, /工资 = 工作日 × 日薪 \+ 额外收入 \+ 奖金/);
});

test("salary trend stays compact and width-safe on mobile", () => {
  assert.match(styles, /\.salaryLinePlot\{[^}]*height:112px/);
  assert.match(styles, /\.salaryTrendMonths\{position:relative;display:block;height:20px;min-width:0/);
  assert.match(styles, /@media \(max-width:560px\)[^\n]*\.salaryTrend\{padding:8px 12px 4px\}\.salaryLinePlot\{height:96px\}/);
  assert.doesNotMatch(styles, /\.salaryTrend[^\n]*(overflow-x:auto|overflow-x:scroll)/);
});

test("each saved salary owns one anchored point, guide, amount, and month label", () => {
  const points = buildSalaryTrendPoints([
    salary("2026-09", 5892.4),
    salary("2026-06", 6493.8),
    salary("2026-07", 7114.6),
  ]);
  assert.equal(points.length, 3);
  assert.equal(points.every((point) => point.showMonth), true);
  assert.deepEqual(points.map((point) => point.x), [9, 50, 91]);
  assert.match(dashboard, /salaryTrendPoints\.map\(\(point\) => <line className="salaryTrendAnchor"[^>]*x1=\{point\.x\}[^>]*x2=\{point\.x\}[^>]*y1=\{point\.y\}[^>]*y2="90"/);
  assert.match(dashboard, /className="salaryTrendMonths"[\s\S]*salaryTrendPoints\.map\(\(point\) => <b[^>]*left: `\$\{point\.x\}%`/);
  assert.match(styles, /\.salaryTrendAnchor\{[^}]*stroke-dasharray:2 2/);
  assert.match(styles, /\.salaryTrendPoint\.first small,\.salaryTrendPoint\.last small\{right:auto;left:50%;transform:translateX\(-50%\)\}/);
});

test("history editor preserves saved inputs and merging updates only one month", () => {
  const june = salary("2026-06", 6493.8);
  const july = { ...salary("2026-07", 7114.6), workdays: 23, dailyRate: 280, deductions: 140, taxThreshold: 5000, taxRate: 3, extraIncome: 100, bonus: 200, leaveDeduction: 50 };
  assert.deepEqual(salaryInputFromRecord(july), {
    month: "2026-07", workdays: 23, dailyRate: 280, deductions: 140, taxThreshold: 5000,
    taxRate: 3, extraIncome: 100, bonus: 200, leaveDeduction: 50,
  });
  const corrected = { ...july, workdays: 22, netSalary: 6800 };
  const merged = mergeSavedSalaryRecord([july, june], corrected);
  assert.deepEqual(merged.map((record) => record.month), ["2026-07", "2026-06"]);
  assert.equal(merged[0].netSalary, 6800);
  assert.deepEqual(merged[1], june);
});

test("salary history offers scoped add and edit controls with non-optimistic saving", () => {
  assert.match(dashboard, /补录月份/);
  assert.match(dashboard, /openHistoryEditor\("edit", record\)/);
  assert.match(dashboard, /await onSaveHistory\(historyEditor\.draft, historyEditor\.mode\)/);
  assert.match(page, /method: mode === "create" \? "POST" : "PUT"/);
  assert.match(page, /setSalaryRecords\(\(records\) => mergeSavedSalaryRecord\(records, record\)\)/);
  assert.match(dashboard, /historyEditor\?\.mode === "edit" && historyEditor\.draft\.month === record\.month && historyEditorView/);
  for (const field of ["月份", "工作日", "日薪", "额外收入", "奖金", "固定扣除", "请假扣款", "起征点", "税率 (%)"]) assert.match(editor, new RegExp(field.replace(/[()]/g, "\\$&")));
  assert.match(editor, /readOnly=\{mode === "edit"\}/);
  assert.match(editor, /saving \? "保存中…"/);
  assert.doesNotMatch(dashboard, /删除工资|deleteSalary|bulk/i);
});
