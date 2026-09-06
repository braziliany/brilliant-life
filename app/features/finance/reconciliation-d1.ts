import type { FinanceTransactionType, LifeDomain, NormalizedFinanceTransaction } from "./types.ts";
import type { ReconciliationOperation, ReconciliationStore, ReconciliationStoredRecord } from "./reconciliation.ts";

type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

type D1ResultLike = { meta?: { changes?: number } };

export type ReconciliationD1Database = {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<D1ResultLike[]>;
};

type D1FinanceRow = {
  id: number;
  source: string;
  source_id: string;
  occurred_at: string;
  type: FinanceTransactionType;
  amount_cents: number;
  currency: string;
  raw_type: string;
  raw_category: string;
  raw_subcategory: string;
  account_from: string;
  account_to: string;
  note: string;
  tags: string;
  life_domain: LifeDomain;
  life_domain_override: LifeDomain | null;
  person_id: number | null;
  project_id: number | null;
  asset_id: number | null;
  event_id: number | null;
  place_id: number | null;
  semantic_note: string;
  created_at: string;
  updated_at: string;
};

const SELECT_SCOPED = `SELECT id, source, source_id, occurred_at, type, amount_cents, currency,
  raw_type, raw_category, raw_subcategory, account_from, account_to, note, tags,
  life_domain, life_domain_override, person_id, project_id, asset_id, event_id, place_id,
  semantic_note, created_at, updated_at
FROM finance_transactions
WHERE source = ? AND substr(occurred_at, 1, 10) >= ? AND substr(occurred_at, 1, 10) <= ?
ORDER BY id`;

const SOURCE_SET = `occurred_at = ?, type = ?, amount_cents = ?, currency = ?, raw_type = ?,
  raw_category = ?, raw_subcategory = ?, account_from = ?, account_to = ?, note = ?, tags = ?,
  life_domain = ?, updated_at = ?`;

function toStoredRecord(row: D1FinanceRow): ReconciliationStoredRecord {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    occurredAt: row.occurred_at,
    type: row.type,
    amountCents: row.amount_cents,
    currency: row.currency,
    rawType: row.raw_type,
    rawCategory: row.raw_category,
    rawSubcategory: row.raw_subcategory,
    accountFrom: row.account_from,
    accountTo: row.account_to,
    note: row.note,
    tags: JSON.parse(row.tags) as string[],
    lifeDomain: row.life_domain,
    lifeDomainOverride: row.life_domain_override,
    personId: row.person_id,
    projectId: row.project_id,
    assetId: row.asset_id,
    eventId: row.event_id,
    placeId: row.place_id,
    semanticNote: row.semantic_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceBindings(item: NormalizedFinanceTransaction, updatedAt: string) {
  return [
    item.occurredAt,
    item.type,
    item.amountCents,
    item.currency,
    item.rawType,
    item.rawCategory,
    item.rawSubcategory,
    item.accountFrom,
    item.accountTo,
    item.note,
    JSON.stringify(item.tags),
    item.lifeDomain,
    updatedAt,
  ];
}

export function createReconciliationD1Store(database: ReconciliationD1Database): ReconciliationStore {
  return {
    atomicity: "transactional-batch",
    async loadScoped(source, from, to) {
      const result = await database.prepare(SELECT_SCOPED).bind(source, from, to).all<D1FinanceRow>();
      return (result.results ?? []).map(toStoredRecord);
    },
    async applyOperations(operations: ReconciliationOperation[]) {
      if (operations.length === 0) return;
      const updatedAt = new Date().toISOString();
      const statements = operations.map((operation) => {
        if (operation.action === "INSERT") {
          const item = operation.canonical;
          return database.prepare(`INSERT INTO finance_transactions (
            source, source_id, occurred_at, type, amount_cents, currency, raw_type, raw_category,
            raw_subcategory, account_from, account_to, note, tags, life_domain, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            item.source, item.sourceId, ...sourceBindings(item, updatedAt),
          );
        }
        if (operation.action === "DELETE") {
          return database.prepare("DELETE FROM finance_transactions WHERE id = ? AND source = 'qianji' AND source_id = ?").bind(operation.oldTransactionId, operation.expectedOldSourceId);
        }
        const rekeyPrefix = operation.action === "REKEY" ? "source_id = ?, " : "";
        const bindings = operation.action === "REKEY"
          ? [operation.canonical.sourceId, ...sourceBindings(operation.canonical, updatedAt), operation.oldTransactionId, operation.expectedOldSourceId]
          : [...sourceBindings(operation.canonical, updatedAt), operation.oldTransactionId, operation.expectedOldSourceId];
        return database.prepare(`UPDATE finance_transactions SET ${rekeyPrefix}${SOURCE_SET} WHERE id = ? AND source = 'qianji' AND source_id = ?`).bind(...bindings);
      });
      const results = await database.batch(statements);
      if (results.length !== operations.length || results.some((result) => result.meta?.changes !== 1)) {
        throw new Error("Reconciliation operation target changed; restore from checkpoint before retry");
      }
    },
  };
}
