import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import { QianJiJsonAdapter } from "../app/features/finance/adapters/qianji-json.ts";
import { classifyLifeDomain, effectiveLifeDomain, mergeImportedSourceFields, normalizeFinanceType, paginateFinanceTransactions, planFinanceImport, resolveFinancePageForYear, sortFinanceTransactionsNewest, sortSignificantEvents, summarizeLifeFinance, toFinanceTransactionAuditView } from "../app/features/finance/domain.ts";

const rows = [
  { 账单ID: "qj-1", 类型: "支出", 金额: 100, 币种: "CNY", 时间: "2026-01-02 08:30:00", 分类: "三餐", 二级分类: "早餐", 账户: "钱包", 备注: "早餐", 标签: "日常" },
  { 账单ID: "qj-2", 类型: "退款", 金额: 10, 币种: "CNY", 时间: "2026-01-03 09:00:00", 分类: "三餐", 二级分类: "早餐", 账户: "钱包", 备注: "退款", 标签: "" },
  { 账单ID: "qj-3", 类型: "收入", 金额: 500, 币种: "CNY", 时间: "2026-01-04 10:00:00", 分类: "工资", 二级分类: "", 账户: "银行卡", 备注: "收入", 标签: "" },
  { 账单ID: "qj-4", 类型: "转账", 金额: 200, 币种: "CNY", 时间: "2026-01-05 11:00:00", 分类: "转账", 二级分类: "", 账户: "银行卡", 备注: "转入钱包", 标签: "" },
  { 账单ID: "qj-5", 类型: "信用卡还款", 金额: 150, 币种: "CNY", 时间: "2026-01-06 12:00:00", 分类: "还款", 二级分类: "", 账户: "银行卡", 备注: "还款", 标签: "" },
];

const xmlEscape = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (index) => { let value = index + 1; let result = ""; while (value) { value -= 1; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); } return result; };
const makeWorkbook = (items) => {
  const headers = Object.keys(items[0]);
  const matrix = [headers, ...items.map((item) => headers.map((header) => item[header]))];
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${matrix.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${col(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet) });
};

test("QianJi JSON and Excel adapters produce identical normalized transactions", async () => {
  const json = await new QianJiJsonAdapter().parse(JSON.stringify({ records: rows }));
  const excel = await new QianJiExcelAdapter().parse(makeWorkbook(rows));
  assert.deepEqual(excel, json);
  assert.equal(json.length, 5);
  assert.equal(json[0].amountCents, 10_000);
});

test("QianJi Excel account1 and account2 headers preserve source accounts", async () => {
  const [transaction] = await new QianJiExcelAdapter().parse(makeWorkbook([{
    ID: "qj-real-account-1",
    时间: "2026-08-11 19:05:10",
    分类: "其它",
    二级分类: "",
    类型: "转账",
    金额: 100,
    币种: "CNY",
    账户1: "来源账户",
    账户2: "目标账户",
    备注: "",
    标签: "",
  }]));
  assert.equal(transaction.accountFrom, "来源账户");
  assert.equal(transaction.accountTo, "目标账户");
});

test("transaction types normalize expense income refund transfer and repayment", () => {
  assert.deepEqual(["支出", "收入", "退款", "转账", "信用卡还款"].map(normalizeFinanceType), ["expense", "income", "refund", "transfer", "repayment"]);
});

test("accounting excludes transfer and repayment and offsets refunds", async () => {
  const normalized = await new QianJiJsonAdapter().parse(rows);
  const records = normalized.map((item, index) => ({ ...item, id: index + 1, lifeDomainOverride: null, personId: null, projectId: null, assetId: null, eventId: null, placeId: null, semanticNote: "" }));
  const summary = summarizeLifeFinance(records, 2026, "2026-12-31");
  assert.equal(summary.expenseCents, 10_000);
  assert.equal(summary.refundCents, 1_000);
  assert.equal(summary.netExpenseCents, 9_000);
  assert.equal(summary.incomeCents, 50_000);
});

test("significant expenses sort by date, same-day amount, then stable source identity", async () => {
  const normalized = await new QianJiJsonAdapter().parse([
    { ...rows[0], 账单ID: "later-small", 时间: "2026-03-02 08:00:00", 金额: 600 },
    { ...rows[0], 账单ID: "same-day-b", 时间: "2026-03-01 20:00:00", 金额: 800 },
    { ...rows[0], 账单ID: "same-day-a", 时间: "2026-03-01 09:00:00", 金额: 800 },
    { ...rows[0], 账单ID: "same-day-large", 时间: "2026-03-01 07:00:00", 金额: 900 },
  ]);
  const records = normalized.map((item, index) => ({ ...item, id: index + 1, lifeDomainOverride: null, personId: null, projectId: null, assetId: null, eventId: null, placeId: null, semanticNote: "" }));
  const originalOrder = records.map((item) => item.sourceId);
  const sorted = sortSignificantEvents(records);
  assert.deepEqual(sorted.map((item) => item.sourceId), ["later-small", "same-day-large", "same-day-a", "same-day-b"]);
  assert.deepEqual(records.map((item) => item.sourceId), originalOrder);
  assert.deepEqual(summarizeLifeFinance(records, 2026, "2026-12-31").significantEvents.map((item) => item.sourceId), ["later-small", "same-day-large", "same-day-a", "same-day-b"]);
});

test("same source import is idempotent and changed source fields plan an update", async () => {
  const [incoming] = await new QianJiJsonAdapter().parse(rows.slice(0, 1));
  const existing = { ...incoming, id: 9, lifeDomainOverride: "family", personId: 12, projectId: 3, assetId: 4, eventId: 5, placeId: 6, semanticNote: "人工说明" };
  assert.equal(planFinanceImport([existing], [incoming])[0].action, "skip");
  const changed = { ...incoming, note: "修改后的来源备注" };
  assert.equal(planFinanceImport([existing], [changed])[0].action, "update");
  const merged = mergeImportedSourceFields(existing, changed);
  assert.equal(merged.note, "修改后的来源备注");
  assert.equal(merged.personId, 12);
  assert.equal(merged.assetId, 4);
  assert.equal(merged.projectId, 3);
  assert.equal(merged.lifeDomainOverride, "family");
});

test("life domain classifier preserves initial mapping baseline", () => {
  assert.equal(classifyLifeDomain("爸爸"), "family");
  assert.equal(classifyLifeDomain("三餐"), "food");
  assert.equal(classifyLifeDomain("人工智能"), "digital");
  assert.equal(classifyLifeDomain("电器数码"), "device");
  assert.equal(classifyLifeDomain("娱乐"), "entertainment");
});

test("transaction audit uses the same effective life domain as aggregation", async () => {
  const [normalized] = await new QianJiJsonAdapter().parse(rows.slice(0, 1));
  const record = { ...normalized, id: 7, lifeDomainOverride: "family", personId: 12, projectId: 3, assetId: 4, eventId: 5, placeId: 6, semanticNote: "人工说明" };
  const audit = toFinanceTransactionAuditView(record);
  const summary = summarizeLifeFinance([record], 2026, "2026-12-31");
  assert.equal(effectiveLifeDomain(record), "family");
  assert.equal(audit.effectiveLifeDomain, "family");
  assert.equal(audit.lifeDomain, "food");
  assert.equal(audit.lifeDomainOverride, "family");
  assert.equal(audit.rawCategory, "三餐");
  assert.equal(audit.source, normalized.source);
  assert.equal(audit.sourceId, normalized.sourceId);
  assert.equal(summary.familySupportCents, normalized.amountCents);
  assert.equal("personId" in audit, false);
  assert.equal("projectId" in audit, false);
  assert.equal("assetId" in audit, false);
  assert.equal("eventId" in audit, false);
  assert.equal("placeId" in audit, false);
});

test("transaction audit falls back to automatic domain without an override", async () => {
  const [normalized] = await new QianJiJsonAdapter().parse(rows.slice(0, 1));
  const record = { ...normalized, id: 8, lifeDomainOverride: null, personId: null, projectId: null, assetId: null, eventId: null, placeId: null, semanticNote: "" };
  assert.equal(effectiveLifeDomain(record), "food");
  assert.equal(toFinanceTransactionAuditView(record).effectiveLifeDomain, "food");
});

test("transaction list is newest first, stable, and paginated without mutating records", async () => {
  const normalized = await new QianJiJsonAdapter().parse([
    { ...rows[0], 账单ID: "old", 时间: "2026-03-01 08:00:00" },
    { ...rows[0], 账单ID: "same-b", 时间: "2026-03-02 08:00:00" },
    { ...rows[0], 账单ID: "same-a", 时间: "2026-03-02 08:00:00" },
  ]);
  const records = normalized.map((item, index) => ({ ...item, id: index + 1, lifeDomainOverride: null, personId: null, projectId: null, assetId: null, eventId: null, placeId: null, semanticNote: "" }));
  const before = records.map((item) => item.sourceId);
  assert.deepEqual(sortFinanceTransactionsNewest(records).map((item) => item.sourceId), ["same-a", "same-b", "old"]);
  const first = paginateFinanceTransactions(records, 1, 2);
  const second = paginateFinanceTransactions(records, 2, 2);
  assert.deepEqual(first.items.map((item) => item.sourceId), ["same-a", "same-b"]);
  assert.deepEqual(second.items.map((item) => item.sourceId), ["old"]);
  assert.deepEqual({ total: first.total, totalPages: first.totalPages, pageSize: first.pageSize }, { total: 3, totalPages: 2, pageSize: 2 });
  assert.deepEqual(records.map((item) => item.sourceId), before);
});

test("changing finance year resets page two to page one", () => {
  assert.equal(resolveFinancePageForYear(2026, 2025, 2), 1);
});

test("a one-page target year resolves to its first page instead of a false empty page", async () => {
  const normalized = await new QianJiJsonAdapter().parse(rows.slice(0, 1));
  const records = normalized.map((item, index) => ({ ...item, id: index + 1, lifeDomainOverride: null, personId: null, projectId: null, assetId: null, eventId: null, placeId: null, semanticNote: "" }));
  const resolvedPage = resolveFinancePageForYear(2026, 2025, 2);
  const target = paginateFinanceTransactions(records, resolvedPage, 20);
  assert.equal(resolvedPage, 1);
  assert.equal(target.totalPages, 1);
  assert.equal(target.items.length, 1);
});

test("same-year finance pagination keeps moving from page one to page two", () => {
  assert.equal(resolveFinancePageForYear(2026, 2026, 1), 1);
  assert.equal(resolveFinancePageForYear(2026, 2026, 2), 2);
});
