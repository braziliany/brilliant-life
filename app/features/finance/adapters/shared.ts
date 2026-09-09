import { classifyLifeDomain, normalizeFinanceType, yuanToCents } from "../domain.ts";
import type { FinanceImportValidation, FinanceImportValidationIssue, NormalizedFinanceTransaction } from "../types.ts";

type RawRow = Record<string, unknown>;

export const QIANJI_FIELD_ALIASES = {
  id: ["source_id", "sourceId", "id", "ID", "账单ID", "账单编号", "记录ID"],
  type: ["type", "类型", "收支类型", "账单类型"],
  amount: ["amount", "金额", "金额(元)", "金额（元）"],
  currency: ["currency", "币种", "货币"],
  occurredAt: ["occurred_at", "occurredAt", "time", "时间", "日期", "交易时间"],
  category: ["category", "分类", "一级分类"],
  subcategory: ["subcategory", "subCategory", "二级分类", "子分类"],
  accountFrom: ["account_from", "accountFrom", "账户", "账户1", "付款账户", "转出账户"],
  accountTo: ["account_to", "accountTo", "账户2", "收款账户", "转入账户"],
  note: ["note", "备注", "商家", "说明"],
  tags: ["tags", "标签"],
} as const;

export const QIANJI_REQUIRED_FIELDS = ["id", "type", "amount", "occurredAt"] as const;

const pick = (row: RawRow, keys: readonly string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
const text = (value: unknown) => value == null ? "" : String(value).trim();
const tags = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/[,，;；|]/).map((item) => item.trim()).filter(Boolean);

function stableSourceId(values: string[]) {
  let hash = 2166136261;
  for (const character of values.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `generated-${(hash >>> 0).toString(16)}`;
}

function normalizedDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const raw = text(value).replace(/\//g, "-");
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] = parts;
  const candidate = new Date(Date.UTC(yearValue, monthValue - 1, dayValue, hourValue, minuteValue, secondValue));
  if (
    candidate.getUTCFullYear() !== yearValue
    || candidate.getUTCMonth() !== monthValue - 1
    || candidate.getUTCDate() !== dayValue
    || candidate.getUTCHours() !== hourValue
    || candidate.getUTCMinutes() !== minuteValue
    || candidate.getUTCSeconds() !== secondValue
  ) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}+08:00`;
}

export function normalizeQianJiRow(row: RawRow): NormalizedFinanceTransaction | null {
  const rawType = text(pick(row, QIANJI_FIELD_ALIASES.type));
  const type = normalizeFinanceType(rawType);
  const amountCents = yuanToCents(pick(row, QIANJI_FIELD_ALIASES.amount));
  const occurredAt = normalizedDate(pick(row, QIANJI_FIELD_ALIASES.occurredAt));
  if (!type || amountCents === null || amountCents < 0 || !occurredAt) return null;
  const rawCategory = text(pick(row, QIANJI_FIELD_ALIASES.category));
  const rawSubcategory = text(pick(row, QIANJI_FIELD_ALIASES.subcategory));
  const accountFrom = text(pick(row, QIANJI_FIELD_ALIASES.accountFrom));
  const accountTo = text(pick(row, QIANJI_FIELD_ALIASES.accountTo));
  const note = text(pick(row, QIANJI_FIELD_ALIASES.note));
  const parsedTags = tags(pick(row, QIANJI_FIELD_ALIASES.tags));
  const explicitId = text(pick(row, QIANJI_FIELD_ALIASES.id));
  return {
    source: "qianji",
    sourceId: explicitId || stableSourceId([occurredAt, rawType, String(amountCents), rawCategory, rawSubcategory, accountFrom, accountTo, note]),
    occurredAt,
    type,
    amountCents,
    currency: text(pick(row, QIANJI_FIELD_ALIASES.currency)) || "CNY",
    rawType,
    rawCategory,
    rawSubcategory,
    accountFrom,
    accountTo,
    note,
    tags: parsedTags,
    lifeDomain: classifyLifeDomain(rawCategory, rawSubcategory),
  };
}

export function missingQianJiHeaders(headers: string[]) {
  return QIANJI_REQUIRED_FIELDS.filter((field) => !QIANJI_FIELD_ALIASES[field].some((alias) => headers.includes(alias)));
}

export function inspectQianJiRows(rows: RawRow[], format: "xlsx" | "json", initialIssues: FinanceImportValidationIssue[] = []): FinanceImportValidation {
  const issues = [...initialIssues];
  const transactions: NormalizedFinanceTransaction[] = [];
  const ids = new Map<string, number>();
  const invalidRows = new Set<number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const explicitId = text(pick(row, QIANJI_FIELD_ALIASES.id));
    const rawType = text(pick(row, QIANJI_FIELD_ALIASES.type));
    const amount = pick(row, QIANJI_FIELD_ALIASES.amount);
    const date = pick(row, QIANJI_FIELD_ALIASES.occurredAt);
    const rowIssues: FinanceImportValidationIssue[] = [];
    if (!explicitId) rowIssues.push({ code: "empty_id", row: rowNumber, field: "id" });
    else ids.set(explicitId, (ids.get(explicitId) ?? 0) + 1);
    if (!normalizeFinanceType(rawType)) rowIssues.push({ code: "unsupported_type", row: rowNumber, field: "type" });
    const amountCents = yuanToCents(amount);
    if (amountCents === null || amountCents < 0) rowIssues.push({ code: "invalid_amount", row: rowNumber, field: "amount" });
    if (!normalizedDate(date)) rowIssues.push({ code: "invalid_date", row: rowNumber, field: "occurredAt" });
    if (rowIssues.length) {
      issues.push(...rowIssues);
      invalidRows.add(rowNumber);
      return;
    }
    const transaction = normalizeQianJiRow(row);
    if (transaction) transactions.push(transaction);
  });

  const duplicateEntries = [...ids.entries()].filter(([, count]) => count > 1);
  for (const [id] of duplicateEntries) {
    rows.forEach((row, index) => {
      if (text(pick(row, QIANJI_FIELD_ALIASES.id)) === id) issues.push({ code: "duplicate_id", row: index + 2, field: "id" });
    });
  }
  return {
    source: "qianji",
    format,
    valid: issues.length === 0 && rows.length > 0,
    records: rows.length,
    duplicateIds: duplicateEntries.length,
    invalidRecords: invalidRows.size,
    issues,
    transactions,
  };
}
