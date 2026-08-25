import type { FinanceTransactionAuditView, FinanceTransactionRecord, FinanceTransactionType, LifeDomain, NormalizedFinanceTransaction } from "./types";

export const LIFE_DOMAIN_LABELS: Record<LifeDomain, string> = {
  family: "家庭",
  food: "饮食",
  digital: "数字生活",
  device: "数码设备",
  entertainment: "兴趣娱乐",
  daily_life: "日常生活",
  transport: "交通",
  appearance: "衣着美容",
  health: "健康",
  learning: "学习",
  other: "其他",
};

const DOMAIN_RULES: Array<[LifeDomain, string[]]> = [
  ["family", ["爸爸", "发红包"]],
  ["food", ["三餐", "零食", "水果"]],
  ["digital", ["软件订阅", "人工智能", "代理流量", "话费网费", "充值缴费"]],
  ["device", ["电器数码"]],
  ["entertainment", ["娱乐", "文化休闲"]],
  ["daily_life", ["日用品", "水电煤", "生活服务"]],
  ["transport", ["交通", "交通出行"]],
  ["appearance", ["衣服", "服饰", "美容", "美妆"]],
  ["health", ["医疗"]],
  ["learning", ["学习"]],
];

export function classifyLifeDomain(category: string, subcategory = ""): LifeDomain {
  const value = `${category} ${subcategory}`.trim();
  return DOMAIN_RULES.find(([, terms]) => terms.some((term) => value.includes(term)))?.[0] ?? "other";
}

export function normalizeFinanceType(value: string): FinanceTransactionType | null {
  const raw = value.trim().toLowerCase();
  if (raw.includes("退款") || raw === "refund") return "refund";
  if (raw.includes("还款") || raw === "repayment") return "repayment";
  if (raw.includes("转账") || raw === "transfer") return "transfer";
  if (raw.includes("收入") || raw === "income") return "income";
  if (raw.includes("支出") || raw === "expense") return "expense";
  return null;
}

export function yuanToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(Math.abs(value) * 100);
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[¥￥,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) : null;
}

export function centsToYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const effectiveLifeDomain = (transaction: Pick<FinanceTransactionRecord, "lifeDomain" | "lifeDomainOverride">) => transaction.lifeDomainOverride ?? transaction.lifeDomain;

export function resolveFinancePageForYear(pageYear: number, requestedYear: number, page: number) {
  return pageYear === requestedYear ? page : 1;
}

export function sortFinanceTransactionsNewest(transactions: FinanceTransactionRecord[]) {
  return [...transactions].sort((a, b) => {
    const timeOrder = b.occurredAt.localeCompare(a.occurredAt);
    if (timeOrder !== 0) return timeOrder;
    const sourceOrder = a.source.localeCompare(b.source);
    if (sourceOrder !== 0) return sourceOrder;
    const sourceIdOrder = a.sourceId.localeCompare(b.sourceId);
    return sourceIdOrder !== 0 ? sourceIdOrder : b.id - a.id;
  });
}

export function toFinanceTransactionAuditView(transaction: FinanceTransactionRecord): FinanceTransactionAuditView {
  return {
    key: `${transaction.source}:${transaction.sourceId}`,
    source: transaction.source,
    sourceId: transaction.sourceId,
    occurredAt: transaction.occurredAt,
    type: transaction.type,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    title: transaction.note || transaction.rawSubcategory || transaction.rawCategory || "财务记录",
    rawType: transaction.rawType,
    rawCategory: transaction.rawCategory,
    rawSubcategory: transaction.rawSubcategory,
    lifeDomain: transaction.lifeDomain,
    lifeDomainOverride: transaction.lifeDomainOverride,
    effectiveLifeDomain: effectiveLifeDomain(transaction),
    semanticNote: transaction.semanticNote,
  };
}

export function paginateFinanceTransactions(transactions: FinanceTransactionRecord[], page: number, pageSize: number) {
  const newest = sortFinanceTransactionsNewest(transactions);
  const total = newest.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;
  return {
    items: newest.slice(offset, offset + pageSize).map(toFinanceTransactionAuditView),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export function sortSignificantEvents(transactions: FinanceTransactionRecord[]) {
  return [...transactions].sort((a, b) => {
    const dateOrder = b.occurredAt.slice(0, 10).localeCompare(a.occurredAt.slice(0, 10));
    if (dateOrder !== 0) return dateOrder;
    if (a.amountCents !== b.amountCents) return b.amountCents - a.amountCents;
    const sourceIdOrder = a.sourceId.localeCompare(b.sourceId);
    return sourceIdOrder !== 0 ? sourceIdOrder : a.id - b.id;
  });
}

export function summarizeLifeFinance(transactions: FinanceTransactionRecord[], year: number, asOfDate: string, significantThresholdCents = 50_000) {
  const yearPrefix = `${year}-`;
  const included = transactions.filter((item) => item.occurredAt.startsWith(yearPrefix) && item.occurredAt.slice(0, 10) <= asOfDate);
  const totals = included.reduce((result, item) => {
    if (item.type === "expense") result.expenseCents += item.amountCents;
    if (item.type === "refund") result.refundCents += item.amountCents;
    if (item.type === "income") result.incomeCents += item.amountCents;
    return result;
  }, { expenseCents: 0, refundCents: 0, incomeCents: 0 });
  const monthly = new Map<string, { expenseCents: number; refundCents: number }>();
  const domains = new Map<LifeDomain, number>();
  for (const item of included) {
    const month = item.occurredAt.slice(0, 7);
    const monthValue = monthly.get(month) ?? { expenseCents: 0, refundCents: 0 };
    if (item.type === "expense") monthValue.expenseCents += item.amountCents;
    if (item.type === "refund") monthValue.refundCents += item.amountCents;
    monthly.set(month, monthValue);
    if (item.type === "expense") {
      const domain = effectiveLifeDomain(item);
      domains.set(domain, (domains.get(domain) ?? 0) + item.amountCents);
    }
    if (item.type === "refund") {
      const domain = effectiveLifeDomain(item);
      domains.set(domain, (domains.get(domain) ?? 0) - item.amountCents);
    }
  }
  const netExpenseCents = totals.expenseCents - totals.refundCents;
  return {
    year,
    asOfDate,
    transactionCount: included.length,
    ...totals,
    netExpenseCents,
    familySupportCents: domains.get("family") ?? 0,
    personalExpenseCents: netExpenseCents - (domains.get("family") ?? 0),
    monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, netExpenseCents: value.expenseCents - value.refundCents })),
    domains: [...domains.entries()].filter(([, amountCents]) => amountCents > 0).sort((a, b) => b[1] - a[1]).map(([domain, amountCents]) => ({ domain, label: LIFE_DOMAIN_LABELS[domain], amountCents, ratio: netExpenseCents > 0 ? amountCents / netExpenseCents : 0 })),
    significantEvents: sortSignificantEvents(included.filter((item) => item.type === "expense" && item.amountCents >= significantThresholdCents)),
  };
}

export function sameSourceFields(existing: FinanceTransactionRecord, incoming: NormalizedFinanceTransaction) {
  return existing.occurredAt === incoming.occurredAt && existing.type === incoming.type && existing.amountCents === incoming.amountCents && existing.currency === incoming.currency && existing.rawType === incoming.rawType && existing.rawCategory === incoming.rawCategory && existing.rawSubcategory === incoming.rawSubcategory && existing.accountFrom === incoming.accountFrom && existing.accountTo === incoming.accountTo && existing.note === incoming.note && JSON.stringify(existing.tags) === JSON.stringify(incoming.tags) && existing.lifeDomain === incoming.lifeDomain;
}

export function mergeImportedSourceFields(existing: FinanceTransactionRecord, incoming: NormalizedFinanceTransaction): FinanceTransactionRecord {
  return { ...existing, ...incoming, id: existing.id, lifeDomainOverride: existing.lifeDomainOverride, personId: existing.personId, projectId: existing.projectId, assetId: existing.assetId, eventId: existing.eventId, placeId: existing.placeId, semanticNote: existing.semanticNote };
}

export function planFinanceImport(existing: FinanceTransactionRecord[], incoming: NormalizedFinanceTransaction[]) {
  const known = new Map(existing.map((item) => [`${item.source}:${item.sourceId}`, item]));
  return incoming.map((item) => {
    const previous = known.get(`${item.source}:${item.sourceId}`);
    return { item, action: !previous ? "insert" as const : sameSourceFields(previous, item) ? "skip" as const : "update" as const };
  });
}
