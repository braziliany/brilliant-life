import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAnnualSummaryDraft,
  summarizeAnnualLifeFinance,
} from "../app/features/annual/domain.ts";

const transaction = (id, occurredAt, type, amountCents, lifeDomain, note = "") => ({
  id,
  source: "qianji",
  sourceId: `synthetic-${String(id).padStart(4, "0")}`,
  occurredAt,
  type,
  amountCents,
  currency: "CNY",
  rawType: type,
  rawCategory: lifeDomain,
  rawSubcategory: "",
  accountFrom: "",
  accountTo: "",
  note,
  tags: [],
  lifeDomain,
  lifeDomainOverride: null,
  personId: null,
  projectId: null,
  assetId: null,
  eventId: null,
  placeId: null,
  semanticNote: "",
});

function realBaselineFixture() {
  const records = [
    transaction(1, "2026-01-02T08:00:00+08:00", "expense", 368_805, "family", "一月家庭支出"),
    transaction(2, "2026-02-02T08:00:00+08:00", "expense", 643_696, "family", "二月家庭支出"),
    transaction(3, "2026-03-02T08:00:00+08:00", "expense", 141_636, "family", "三月家庭支出"),
    transaction(4, "2026-03-10T08:00:00+08:00", "expense", 187_053, "food", "三月个人消费"),
    transaction(5, "2026-04-10T08:00:00+08:00", "expense", 272_229, "digital", "四月个人消费"),
    transaction(6, "2026-05-10T08:00:00+08:00", "expense", 499_067, "device", "五月个人消费"),
    transaction(7, "2026-06-10T08:00:00+08:00", "expense", 749_312, "daily_life", "六月个人消费"),
    transaction(8, "2026-07-10T08:00:00+08:00", "expense", 265_587, "transport", "七月个人消费"),
    transaction(9, "2026-08-10T08:00:00+08:00", "expense", 281_336, "entertainment", "八月个人消费"),
    transaction(10, "2026-08-10T09:00:00+08:00", "refund", 90_820, "entertainment", "八月退款"),
    transaction(11, "2026-08-11T10:00:00+08:00", "income", 4_335_928, "other", "年度收入"),
  ];
  for (let index = 0; index < 1_024; index += 1) {
    const month = (index % 8) + 1;
    const day = index === 0 ? 1 : (index % 10) + 1;
    records.push(transaction(
      records.length + 1,
      `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+08:00`,
      index % 2 ? "transfer" : "repayment",
      10_000 + index,
      "other",
      "",
    ));
  }
  return records;
}

const emptyAnnualInput = (overrides = {}) => ({
  generatedAt: "2026-08-14T04:00:00.000Z",
  asOfDate: "2026-08-14",
  healthRecords: [],
  calendarData: { overrides: {} },
  salaryRecords: [],
  financeTransactions: [],
  experiences: [],
  ...overrides,
});

test("annual Life Finance preserves the accepted 1,035-row accounting baseline", () => {
  const summary = summarizeAnnualLifeFinance(2026, realBaselineFixture(), "2026-08-14", 8, "in-progress");
  assert.equal(summary.facts.recordCount, 1_035);
  assert.equal(summary.facts.dateStart, "2026-01-01");
  assert.equal(summary.facts.dateEnd, "2026-08-11");
  assert.equal(summary.facts.incomeCents, 4_335_928);
  assert.equal(summary.facts.grossExpenseCents, 3_408_721);
  assert.equal(summary.facts.refundsCents, 90_820);
  assert.equal(summary.facts.netExpenseCents, 3_317_901);
  assert.equal(summary.facts.familyExpenseCents, 1_154_137);
  assert.equal(summary.facts.personalExpenseCents, 2_163_764);
  assert.deepEqual(summary.facts.monthlyNetExpense.map((item) => item.netExpenseCents), [368_805, 643_696, 328_689, 272_229, 499_067, 749_312, 265_587, 190_516]);
  assert.deepEqual(summary.coverage.coveredMonths, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(summary.sources, ["finance_transactions:qianji"]);
  assert.deepEqual(summary.warnings, ["life-finance-records-cutoff"]);
});

test("salary snapshots and Life Finance remain separate annual sources", () => {
  const draft = generateAnnualSummaryDraft(2026, emptyAnnualInput({
    salaryRecords: [{ id: 1, month: "2026-07", workdays: 23, dailyRate: 275, grossSalary: 6325, fixedDeduction: 130, extraIncome: 0, bonus: 0, leaveDeduction: 0, taxableIncome: 1195, incomeTax: 35.85, netSalary: 6159.15, createdAt: "2026-07-31T12:00:00.000Z", updatedAt: "2026-07-31T12:00:00.000Z" }],
    financeTransactions: realBaselineFixture(),
  }));
  assert.equal(draft.finance.salary.facts.totalNetSalary, 6159.15);
  assert.equal(draft.finance.lifeFinance.facts.incomeCents, 4_335_928);
  assert.equal("totalIncome" in draft.finance, false);
  assert.deepEqual(draft.finance.sources, ["salary_records", "finance_transactions:qianji"]);
});

test("salary and Life Finance expose four independent empty-state combinations", () => {
  const salary = [{ id: 1, month: "2026-07", workdays: 1, dailyRate: 275, grossSalary: 275, fixedDeduction: 130, extraIncome: 0, bonus: 0, leaveDeduction: 0, taxableIncome: 0, incomeTax: 0, netSalary: 145, createdAt: "", updatedAt: "" }];
  const finance = [transaction(1, "2026-07-01T08:00:00+08:00", "expense", 100, "food")];
  for (const [salaryRecords, financeTransactions, expectedSalary, expectedFinance] of [
    [[], [], 0, 0],
    [salary, [], 1, 0],
    [[], finance, 0, 1],
    [salary, finance, 1, 1],
  ]) {
    const draft = generateAnnualSummaryDraft(2026, emptyAnnualInput({ salaryRecords, financeTransactions }));
    assert.equal(draft.finance.salary.facts.savedMonthCount, expectedSalary);
    assert.equal(draft.finance.lifeFinance.facts.recordCount, expectedFinance);
  }
});

test("annual Life Finance applies year and current-year as-of boundaries", () => {
  const summary = summarizeAnnualLifeFinance(2026, [
    transaction(1, "2025-12-31T23:59:00+08:00", "expense", 10_000, "food"),
    transaction(2, "2026-08-14T23:59:00+08:00", "expense", 20_000, "food"),
    transaction(3, "2026-08-15T00:00:00+08:00", "expense", 30_000, "food"),
    transaction(4, "2027-01-01T00:00:00+08:00", "expense", 40_000, "food"),
  ], "2026-08-14", 8, "in-progress");
  assert.equal(summary.facts.recordCount, 1);
  assert.equal(summary.facts.netExpenseCents, 20_000);
  assert.equal(summary.coverage.scope, "year-to-date");
  assert.equal(summary.coverage.completeYear, false);
});

test("important annual expenses are bounded, ordered, and exclude provenance identifiers", () => {
  const summary = summarizeAnnualLifeFinance(2026, realBaselineFixture(), "2026-08-14", 8, "in-progress");
  assert.equal(summary.facts.importantExpenses.length, 5);
  assert.deepEqual(summary.facts.importantExpenses.map((item) => item.date), ["2026-08-10", "2026-07-10", "2026-06-10", "2026-05-10", "2026-04-10"]);
  for (const item of summary.facts.importantExpenses) {
    assert.deepEqual(Object.keys(item).sort(), ["amountCents", "category", "date", "title"]);
    assert.equal("sourceId" in item, false);
    assert.equal("accountFrom" in item, false);
  }
});

test("historical full-year Life Finance can be complete only with year boundary records", () => {
  const summary = summarizeAnnualLifeFinance(2025, [
    transaction(1, "2025-01-01T00:00:00+08:00", "income", 100, "other"),
    transaction(2, "2025-12-31T23:59:00+08:00", "expense", 50, "food"),
  ], "2025-12-31", 12, "complete");
  assert.equal(summary.coverage.scope, "full-year");
  assert.equal(summary.coverage.completeYear, true);
  assert.equal(summary.coverage.ratio, 0.1667);
});
