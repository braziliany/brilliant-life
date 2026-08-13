import { classifyLifeDomain, normalizeFinanceType, yuanToCents } from "../domain.ts";
import type { NormalizedFinanceTransaction } from "../types.ts";

type RawRow = Record<string, unknown>;

const aliases = {
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
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}+08:00`;
}

export function normalizeQianJiRow(row: RawRow): NormalizedFinanceTransaction | null {
  const rawType = text(pick(row, aliases.type));
  const type = normalizeFinanceType(rawType);
  const amountCents = yuanToCents(pick(row, aliases.amount));
  const occurredAt = normalizedDate(pick(row, aliases.occurredAt));
  if (!type || amountCents === null || amountCents < 0 || !occurredAt) return null;
  const rawCategory = text(pick(row, aliases.category));
  const rawSubcategory = text(pick(row, aliases.subcategory));
  const accountFrom = text(pick(row, aliases.accountFrom));
  const accountTo = text(pick(row, aliases.accountTo));
  const note = text(pick(row, aliases.note));
  const parsedTags = tags(pick(row, aliases.tags));
  const explicitId = text(pick(row, aliases.id));
  return {
    source: "qianji",
    sourceId: explicitId || stableSourceId([occurredAt, rawType, String(amountCents), rawCategory, rawSubcategory, accountFrom, accountTo, note]),
    occurredAt,
    type,
    amountCents,
    currency: text(pick(row, aliases.currency)) || "CNY",
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
