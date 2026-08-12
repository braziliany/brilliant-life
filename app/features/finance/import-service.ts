import { eq } from "drizzle-orm";
import type { getDb } from "../../../db";
import { financeTransactions } from "../../../db/schema.ts";
import { sameSourceFields } from "./domain.ts";
import type { FinanceImportReport, FinanceTransactionRecord, NormalizedFinanceTransaction } from "./types.ts";

type FinanceDb = ReturnType<typeof getDb>;

export const toFinanceRecord = (row: typeof financeTransactions.$inferSelect): FinanceTransactionRecord => ({
  id: row.id,
  source: row.source,
  sourceId: row.sourceId,
  occurredAt: row.occurredAt,
  type: row.type,
  amountCents: row.amountCents,
  currency: row.currency,
  rawType: row.rawType,
  rawCategory: row.rawCategory,
  rawSubcategory: row.rawSubcategory,
  accountFrom: row.accountFrom,
  accountTo: row.accountTo,
  note: row.note,
  tags: JSON.parse(row.tags) as string[],
  lifeDomain: row.lifeDomain as FinanceTransactionRecord["lifeDomain"],
  lifeDomainOverride: row.lifeDomainOverride as FinanceTransactionRecord["lifeDomainOverride"],
  personId: row.personId,
  projectId: row.projectId,
  assetId: row.assetId,
  eventId: row.eventId,
  placeId: row.placeId,
  semanticNote: row.semanticNote,
});

const sourceValues = (item: NormalizedFinanceTransaction) => ({
  source: item.source,
  sourceId: item.sourceId,
  occurredAt: item.occurredAt,
  type: item.type,
  amountCents: item.amountCents,
  currency: item.currency,
  rawType: item.rawType,
  rawCategory: item.rawCategory,
  rawSubcategory: item.rawSubcategory,
  accountFrom: item.accountFrom,
  accountTo: item.accountTo,
  note: item.note,
  tags: JSON.stringify(item.tags),
  lifeDomain: item.lifeDomain,
  updatedAt: new Date().toISOString(),
});

export async function importFinanceTransactions(db: FinanceDb, incoming: NormalizedFinanceTransaction[]): Promise<FinanceImportReport> {
  const report = { read: incoming.length, inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const sources = [...new Set(incoming.map((item) => item.source))];
  const existingRows = (await Promise.all(sources.map((source) => db.select().from(financeTransactions).where(eq(financeTransactions.source, source))))).flat();
  const existing = new Map(existingRows.map((row) => [`${row.source}:${row.sourceId}`, toFinanceRecord(row)]));

  for (const item of incoming) {
    try {
      const previous = existing.get(`${item.source}:${item.sourceId}`);
      if (previous && sameSourceFields(previous, item)) {
        report.skipped += 1;
        continue;
      }
      const values = sourceValues(item);
      await db.insert(financeTransactions).values(values).onConflictDoUpdate({
        target: [financeTransactions.source, financeTransactions.sourceId],
        set: values,
      });
      if (previous) report.updated += 1;
      else report.inserted += 1;
    } catch {
      report.failed += 1;
    }
  }
  return report;
}

export function validNormalizedFinanceTransaction(value: unknown): value is NormalizedFinanceTransaction {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.source === "qianji" && typeof item.sourceId === "string" && item.sourceId.length > 0 && typeof item.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item.occurredAt) && ["expense", "income", "refund", "transfer", "repayment"].includes(String(item.type)) && Number.isInteger(item.amountCents) && Number(item.amountCents) >= 0 && typeof item.currency === "string" && Array.isArray(item.tags);
}
