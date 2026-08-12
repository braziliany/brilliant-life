import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import { QianJiJsonAdapter } from "../app/features/finance/adapters/qianji-json.ts";
import { classifyLifeDomain, mergeImportedSourceFields, normalizeFinanceType, planFinanceImport, summarizeLifeFinance } from "../app/features/finance/domain.ts";

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
