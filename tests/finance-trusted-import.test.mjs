import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import { QianJiJsonAdapter } from "../app/features/finance/adapters/qianji-json.ts";
import { trustedQianJiTransactions } from "../app/features/finance/trusted-import.ts";

const headers = ["ID", "时间", "类型", "金额", "币种", "分类", "二级分类", "账户1", "账户2", "备注", "标签"];
const escapeXml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const column = (index) => {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
};
const inlineCell = (value, reference) => "<c r=\"" + reference + "\" t=\"inlineStr\"><is><t>" + escapeXml(value) + "</t></is></c>";
const sharedEmptyCell = (reference) => "<c r=\"" + reference + "\" t=\"s\"><v>23</v></c>";

function sharedStringWorkbook(items, workbookHeaders = headers) {
  const shared = Array.from({ length: 23 }, (_, index) => "<si><t>unused-" + index + "</t></si>").join("") + "<si><t></t></si>";
  const matrix = [workbookHeaders, ...items.map((item) => workbookHeaders.map((header) => item[header] ?? ""))];
  const sheetRows = matrix.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = column(columnIndex) + (rowIndex + 1);
      return rowIndex > 0 && value === "" ? sharedEmptyCell(reference) : inlineCell(value, reference);
    }).join("");
    return "<row r=\"" + (rowIndex + 1) + "\">" + cells + "</row>";
  }).join("");
  const sheet = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>" + sheetRows + "</sheetData></worksheet>";
  const strings = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"24\" uniqueCount=\"24\">" + shared + "</sst>";
  return zipSync({
    "xl/sharedStrings.xml": strToU8(strings),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

const records = [
  { ID: "qj-expense", 时间: "2026-01-01 08:00:00", 类型: "支出", 金额: "12.34", 币种: "CNY", 分类: "三餐", 二级分类: "", 账户1: "合成钱包", 账户2: "", 备注: "", 标签: "" },
  { ID: "qj-income", 时间: "2026-01-02 08:00:00", 类型: "收入", 金额: "100", 币种: "CNY", 分类: "工资", 二级分类: "月薪", 账户1: "合成银行卡", 账户2: "", 备注: "合成收入", 标签: "synthetic" },
  { ID: "qj-refund", 时间: "2026-01-03 08:00:00", 类型: "退款", 金额: "2", 币种: "CNY", 分类: "三餐", 二级分类: "早餐", 账户1: "合成钱包", 账户2: "", 备注: "合成退款", 标签: "" },
  { ID: "qj-transfer", 时间: "2026-01-04 08:00:00", 类型: "转账", 金额: "50", 币种: "CNY", 分类: "转账", 二级分类: "", 账户1: "合成账户 A", 账户2: "合成账户 B", 备注: "", 标签: "" },
  { ID: "qj-repayment", 时间: "2026-01-05 08:00:00", 类型: "还款", 金额: "25", 币种: "CNY", 分类: "还款", 二级分类: "", 账户1: "合成账户 B", 账户2: "合成账户 C", 备注: "", 标签: "" },
];

test("trusted XLSX validation reuses shared-string parsing and preserves index 23 as empty", async () => {
  const validation = await new QianJiExcelAdapter().inspect(sharedStringWorkbook(records));
  assert.equal(validation.valid, true);
  assert.equal(validation.source, "qianji");
  assert.equal(validation.records, 5);
  assert.equal(validation.duplicateIds, 0);
  assert.equal(validation.invalidRecords, 0);
  const transactions = trustedQianJiTransactions(validation);
  assert.deepEqual(transactions.map((item) => item.type), ["expense", "income", "refund", "transfer", "repayment"]);
  assert.equal(transactions.every((item) => item.sourceId.startsWith("qj-")), true);
  assert.equal(transactions.every((item) => item.occurredAt.endsWith("+08:00")), true);
  assert.equal(transactions[0].rawSubcategory, "");
  assert.equal(transactions[0].accountTo, "");
  assert.equal(transactions[0].note, "");
  assert.deepEqual(transactions[0].tags, []);
  assert.equal(transactions[3].accountFrom, "合成账户 A");
  assert.equal(transactions[3].accountTo, "合成账户 B");
});

test("trusted JSON accepts the supported container and explicit unique IDs", async () => {
  const validation = await new QianJiJsonAdapter().inspect({ records });
  assert.equal(validation.valid, true);
  assert.equal(validation.format, "json");
  assert.equal(validation.transactions.length, records.length);
});

test("trusted validation blocks duplicate and empty explicit IDs", async () => {
  const duplicate = await new QianJiJsonAdapter().inspect([records[0], { ...records[0] }]);
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.duplicateIds, 1);
  assert.equal(duplicate.issues.some((issue) => issue.code === "duplicate_id"), true);

  const empty = await new QianJiJsonAdapter().inspect([{ ...records[0], ID: "" }]);
  assert.equal(empty.valid, false);
  assert.equal(empty.invalidRecords, 1);
  assert.equal(empty.issues.some((issue) => issue.code === "empty_id"), true);
  assert.throws(() => trustedQianJiTransactions(empty), /账单 ID/);
});

test("trusted validation blocks malformed facts and unsupported structures", async () => {
  const invalid = await new QianJiJsonAdapter().inspect([
    { ...records[0], ID: "bad-date", 时间: "not-a-date" },
    { ...records[0], ID: "impossible-date", 时间: "2026-99-99 08:00:00" },
    { ...records[0], ID: "bad-amount", 金额: "not-money" },
    { ...records[0], ID: "bad-type", 类型: "未知类型" },
    "not-a-record",
  ]);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.invalidRecords, 5);
  assert.deepEqual(new Set(invalid.issues.map((issue) => issue.code)), new Set(["empty_id", "invalid_date", "invalid_amount", "unsupported_type"]));

  const malformedJson = await new QianJiJsonAdapter().inspect("{");
  assert.equal(malformedJson.valid, false);
  assert.equal(malformedJson.issues[0].code, "invalid_structure");

  const invalidWorkbook = await new QianJiExcelAdapter().inspect(new Uint8Array([1, 2, 3]));
  assert.equal(invalidWorkbook.valid, false);
  assert.equal(invalidWorkbook.issues[0].code, "invalid_structure");

  const missingHeader = await new QianJiExcelAdapter().inspect(sharedStringWorkbook(records, headers.filter((header) => header !== "金额")));
  assert.equal(missingHeader.valid, false);
  assert.equal(missingHeader.issues.some((issue) => issue.code === "missing_required_header" && issue.field === "amount"), true);
});

test("validation CLI reports only the lightweight normal-import contract", () => {
  const root = mkdtempSync(join(tmpdir(), "qianji-trusted-"));
  try {
    const fixture = join(root, "synthetic.json");
    writeFileSync(fixture, JSON.stringify({ records }), "utf8");
    const output = execFileSync(process.execPath, ["scripts/finance-validate.mjs", "--file", fixture], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    });
    assert.match(output, /钱迹文件有效 · 5 条 · 0 个重复 ID · 0 条无效记录/);
    assert.doesNotMatch(output, /manifest|MISSING|REKEY|AMBIGUOUS|precondition/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
