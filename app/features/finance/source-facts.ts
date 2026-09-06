import type { FinanceTransactionRecord, NormalizedFinanceTransaction } from "./types.ts";

export const FINANCE_SOURCE_FACT_FIELDS = [
  "occurredAt",
  "type",
  "amountCents",
  "currency",
  "rawType",
  "rawCategory",
  "rawSubcategory",
  "accountFrom",
  "accountTo",
  "note",
  "tags",
  "lifeDomain",
] as const;

export type FinanceSourceFactField = typeof FINANCE_SOURCE_FACT_FIELDS[number];

export function financeSourceFactProjection(transaction: NormalizedFinanceTransaction) {
  return {
    occurredAt: transaction.occurredAt,
    type: transaction.type,
    amountCents: transaction.amountCents,
    currency: transaction.currency,
    rawType: transaction.rawType,
    rawCategory: transaction.rawCategory,
    rawSubcategory: transaction.rawSubcategory,
    accountFrom: transaction.accountFrom,
    accountTo: transaction.accountTo,
    note: transaction.note,
    tags: [...transaction.tags],
    lifeDomain: transaction.lifeDomain,
  };
}

export function changedFinanceSourceFields(existing: FinanceTransactionRecord, incoming: NormalizedFinanceTransaction): FinanceSourceFactField[] {
  const before = financeSourceFactProjection(existing);
  const after = financeSourceFactProjection(incoming);
  return FINANCE_SOURCE_FACT_FIELDS.filter((field) => field === "tags"
    ? JSON.stringify(before.tags) !== JSON.stringify(after.tags)
    : before[field] !== after[field]);
}

export function sameFinanceSourceFacts(existing: FinanceTransactionRecord, incoming: NormalizedFinanceTransaction) {
  return changedFinanceSourceFields(existing, incoming).length === 0;
}

export function isGeneratedFinanceSourceId(sourceId: string) {
  return /^generated-[0-9a-f]+$/i.test(sourceId);
}
