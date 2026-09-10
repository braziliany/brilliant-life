import assert from "node:assert/strict";
import test from "node:test";

import { collectTimelineYears, deriveTimelineItems, groupTimelineItemsByYear, sortTimelineItems } from "../app/features/timeline/domain.ts";

const salary = (month, netSalary, workdays) => ({ month, netSalary, workdays });
const annual = (year, periodStatus = "complete", asOfDate = `${year}-12-31`) => ({
  year,
  periodStatus,
  asOfDate,
  calculationVersion: "annual-summary-v3",
});

test("career items preserve month precision and current work uses 至今", () => {
  const [item] = deriveTimelineItems({
    experiences: [{ id: 8, company: "某公司", role: "某职位", startDate: "2024-06", endDate: null, summary: "" }],
    salaryRecords: [],
    annualSummaries: [],
  });
  assert.equal(item.datePrecision, "month");
  assert.equal(item.year, 2024);
  assert.equal(item.month, 6);
  assert.equal(item.summary, "2024-06 至今");
});

test("salary items use only saved snapshot values without policy calculation", () => {
  const items = deriveTimelineItems({
    experiences: [],
    salaryRecords: [salary("2026-07", 6159.15, 23)],
    annualSummaries: [],
  });
  assert.deepEqual(items.map(({ title, summary }) => ({ title, summary })), [{
    title: "实发 ¥6,159.15",
    summary: "23 个工作日",
  }]);
});

test("annual current year remains an as-of YTD item", () => {
  const [item] = deriveTimelineItems({
    experiences: [],
    salaryRecords: [],
    annualSummaries: [annual(2026, "in-progress", "2026-09-10")],
  });
  assert.equal(item.datePrecision, "year");
  assert.equal(item.summary, "截至 2026-09-10");
  assert.equal(item.source, "annual-summary-v3");
});

test("ordering is newest-first with deterministic career salary annual ties", () => {
  const sorted = sortTimelineItems([
    { id: "salary:2026-07", kind: "salary", datePrecision: "month", year: 2026, month: 7, title: "工资", source: "salary_records", href: "/" },
    { id: "annual:2026", kind: "annual", datePrecision: "year", year: 2026, title: "年度", source: "annual-summary-v3", href: "/" },
    { id: "career:1", kind: "career", datePrecision: "month", year: 2026, month: 7, title: "职业", source: "work_experiences", href: "/" },
    { id: "salary:2025-12", kind: "salary", datePrecision: "month", year: 2025, month: 12, title: "工资", source: "salary_records", href: "/" },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["career:1", "salary:2026-07", "annual:2026", "salary:2025-12"]);
});

test("year grouping stays deterministic and empty input remains empty", () => {
  const items = deriveTimelineItems({ experiences: [], salaryRecords: [salary("2026-07", 1, 1), salary("2025-12", 2, 2)], annualSummaries: [] });
  assert.deepEqual(groupTimelineItemsByYear(items).map(({ year }) => year), [2026, 2025]);
  assert.deepEqual(groupTimelineItemsByYear([]), []);
});

test("annual year candidates cover career spans, saved salary years, and current year", () => {
  assert.deepEqual(collectTimelineYears(
    [
      { id: 1, company: "A", role: "B", startDate: "2024-06", endDate: "2025-03", summary: "" },
      { id: 2, company: "C", role: "D", startDate: "2026-04", endDate: null, summary: "" },
    ],
    [salary("2023-12", 1, 1)],
    2026,
  ), [2026, 2025, 2024, 2023]);
  assert.deepEqual(collectTimelineYears([], [], 2026), []);
});
