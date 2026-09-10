import { isGeneratedFinanceSourceId } from "../app/features/finance/source-facts.ts";
import { createFinanceReconciliationSnapshot, reconciliationPreconditionHash, sha256, type ReconciliationStoredRecord } from "../app/features/finance/reconciliation.ts";
import type { FinanceImportValidation, NormalizedFinanceTransaction } from "../app/features/finance/types.ts";

export const QIANJI_BASELINE_REBUILD_CONTRACT = {
  source: "qianji",
  from: "2026-01-01T00:00:00+08:00",
  toExclusive: "2026-09-01T00:00:00+08:00",
  firstOccurredAt: "2026-01-01T16:16:16+08:00",
  lastOccurredAt: "2026-08-31T21:43:37+08:00",
  canonicalSha256: "5d724afeadcb7b21e23529713f4921c80f6dd03694161eca1571da51cf130826",
  canonicalRecords: 1132,
  productionRows: 1099,
  preconditionHash: "b9ecd9ff9af06d4540663db8560d0491a797dfb2f4262d83a652a8e562a3810f",
  sourceIdSetHash: "6637be05a416260b0725e4c364a45cf2bd4cd06e10ef266257de79e23c283305",
  databaseName: "pulse-health-dashboard-db",
  databaseId: "556b490d-99c9-4901-bffc-ee0b8c2f8a62",
  typeCounts: { expense: 1069, income: 16, refund: 7, transfer: 31, repayment: 9 },
  accounting: { incomeCents: 4_333_370, grossExpenseCents: 3_678_932, refundCents: 100_270, netExpenseCents: 3_578_662, familyCents: 1_156_107, personalCents: 2_422_555 },
} as const;

export type QianJiBaselineContract = {
  source: "qianji";
  from: string;
  toExclusive: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  canonicalSha256: string;
  canonicalRecords: number;
  productionRows: number;
  preconditionHash: string;
  sourceIdSetHash: string;
  databaseName: string;
  databaseId: string;
  typeCounts: Record<"expense" | "income" | "refund" | "transfer" | "repayment", number>;
  accounting: { incomeCents: number; grossExpenseCents: number; refundCents: number; netExpenseCents: number; familyCents: number; personalCents: number };
};
type D1ResultLike = { meta?: { changes?: number } };
export type BaselineD1Statement = { bind(...values: unknown[]): BaselineD1Statement; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> };
export type BaselineD1Database = { prepare(query: string): BaselineD1Statement; batch(statements: BaselineD1Statement[]): Promise<D1ResultLike[]> };

type D1FinanceRow = {
  id: number; source: string; source_id: string; occurred_at: string; type: ReconciliationStoredRecord["type"];
  amount_cents: number; currency: string; raw_type: string; raw_category: string; raw_subcategory: string;
  account_from: string; account_to: string; note: string; tags: string; life_domain: ReconciliationStoredRecord["lifeDomain"];
  life_domain_override: ReconciliationStoredRecord["lifeDomainOverride"]; person_id: number | null; project_id: number | null;
  asset_id: number | null; event_id: number | null; place_id: number | null; semantic_note: string;
};

export type BaselineInterlocks = { apply: boolean; target: string | undefined; confirm: boolean };
export type BaselineRunResult = {
  mode: "DRY RUN" | "APPLIED"; wrote: boolean; deleteCount: number; insertCount: number; preconditionHash: string;
  before: ReturnType<typeof createFinanceReconciliationSnapshot>; expectedAfter: ReturnType<typeof createFinanceReconciliationSnapshot>;
  after?: ReturnType<typeof createFinanceReconciliationSnapshot>; timestamp: string;
};

const SELECT_SCOPED = `SELECT id, source, source_id, occurred_at, type, amount_cents, currency,
  raw_type, raw_category, raw_subcategory, account_from, account_to, note, tags,
  life_domain, life_domain_override, person_id, project_id, asset_id, event_id, place_id, semantic_note
FROM finance_transactions
WHERE source = ? AND occurred_at >= ? AND occurred_at < ?
ORDER BY id`;
const DELETE_SCOPED = `DELETE FROM finance_transactions
WHERE source = ? AND occurred_at >= ? AND occurred_at < ?`;
const INSERT_COLUMNS = `source_id, occurred_at, type, amount_cents, currency, raw_type,
  raw_category, raw_subcategory, account_from, account_to, note, tags, life_domain`;
const INSERT_FIELDS = ["sourceId", "occurredAt", "type", "amountCents", "currency", "rawType", "rawCategory", "rawSubcategory", "accountFrom", "accountTo", "note", "tags", "lifeDomain"] as const;
const block = (message: string): never => { throw new Error(`BLOCK: ${message}`); };
const equalRecord = (value: unknown, expected: unknown) => JSON.stringify(value) === JSON.stringify(expected);

function toStoredRecord(row: D1FinanceRow): ReconciliationStoredRecord {
  return {
    id: row.id, source: row.source, sourceId: row.source_id, occurredAt: row.occurred_at, type: row.type,
    amountCents: row.amount_cents, currency: row.currency, rawType: row.raw_type, rawCategory: row.raw_category,
    rawSubcategory: row.raw_subcategory, accountFrom: row.account_from, accountTo: row.account_to, note: row.note,
    tags: JSON.parse(row.tags) as string[], lifeDomain: row.life_domain, lifeDomainOverride: row.life_domain_override,
    personId: row.person_id, projectId: row.project_id, assetId: row.asset_id, eventId: row.event_id,
    placeId: row.place_id, semanticNote: row.semantic_note,
  };
}

function canonicalRecords(transactions: NormalizedFinanceTransaction[]): ReconciliationStoredRecord[] {
  return transactions.map((transaction, index) => ({ ...transaction, id: index + 1, lifeDomainOverride: null, personId: null, projectId: null, assetId: null, eventId: null, placeId: null, semanticNote: "" }));
}

function assertExpectedSnapshot(snapshot: ReturnType<typeof createFinanceReconciliationSnapshot>, contract: QianJiBaselineContract) {
  if (snapshot.records !== contract.canonicalRecords) block("canonical record count differs");
  if (!equalRecord(snapshot.typeCounts, contract.typeCounts)) block("canonical type counts differ");
  for (const [field, expected] of Object.entries(contract.accounting)) {
    if (snapshot[field as keyof typeof snapshot] !== expected) block(`canonical ${field} differs`);
  }
  if (snapshot.sourceIdSetHash !== contract.sourceIdSetHash) block("canonical sourceId set differs");
}

export function validateQianJiBaselineCanonical(bytes: Uint8Array, validation: FinanceImportValidation, contract: QianJiBaselineContract = QIANJI_BASELINE_REBUILD_CONTRACT) {
  if (sha256(bytes) !== contract.canonicalSha256) block("canonical SHA-256 differs");
  if (!validation.valid) block("canonical adapter validation failed");
  if (validation.records !== contract.canonicalRecords) block("canonical record count differs");
  if (validation.duplicateIds !== 0) block("canonical contains duplicate source IDs");
  if (validation.invalidRecords !== 0) block("canonical contains invalid records");
  if (validation.transactions.some((item) => item.source !== contract.source)) block("canonical source differs");
  if (validation.transactions.some((item) => isGeneratedFinanceSourceId(item.sourceId))) block("canonical contains generated source IDs");
  const dates = validation.transactions.map((item) => item.occurredAt).sort();
  if (dates[0] !== contract.firstOccurredAt || dates.at(-1) !== contract.lastOccurredAt) block("canonical date range differs");
  const snapshot = createFinanceReconciliationSnapshot(canonicalRecords(validation.transactions));
  assertExpectedSnapshot(snapshot, contract);
  return { transactions: validation.transactions, snapshot };
}

export async function loadQianJiBaselineScope(database: BaselineD1Database, contract: QianJiBaselineContract = QIANJI_BASELINE_REBUILD_CONTRACT) {
  const result = await database.prepare(SELECT_SCOPED).bind(contract.source, contract.from, contract.toExclusive).all<D1FinanceRow>();
  return (result.results ?? []).map(toStoredRecord);
}

function assertManualAssetsEmpty(records: ReconciliationStoredRecord[]) {
  if (records.some((record) => record.lifeDomainOverride !== null)) block("lifeDomainOverride assets exist");
  if (records.some((record) => record.semanticNote.trim() !== "")) block("semanticNote assets exist");
  for (const field of ["personId", "projectId", "assetId", "eventId", "placeId"] as const) {
    if (records.some((record) => record[field] !== null)) block(`${field} assets exist`);
  }
}

function buildInsertStatement(database: BaselineD1Database, transactions: NormalizedFinanceTransaction[]) {
  const canonicalJson = JSON.stringify(transactions.map((item) => Object.fromEntries(INSERT_FIELDS.map((field) => [field, item[field]]))));
  const selections = INSERT_FIELDS.map((field) => `json_extract(value, '$.${field}')`);
  const sql = `INSERT INTO finance_transactions (source, ${INSERT_COLUMNS})
SELECT 'qianji', ${selections.join(", ")}
FROM json_each(?)`;
  return database.prepare(sql).bind(canonicalJson);
}

function assertPostState(records: ReconciliationStoredRecord[], canonical: NormalizedFinanceTransaction[], contract: QianJiBaselineContract) {
  const snapshot = createFinanceReconciliationSnapshot(records);
  assertExpectedSnapshot(snapshot, contract);
  const canonicalIds = new Set(canonical.map((item) => item.sourceId));
  const actualIds = new Set(records.map((item) => item.sourceId));
  if (actualIds.size !== records.length) throw new Error("duplicate source IDs");
  if ([...actualIds].some((id) => !canonicalIds.has(id))) throw new Error("extra old source IDs");
  if ([...canonicalIds].some((id) => !actualIds.has(id))) throw new Error("missing canonical source IDs");
  return snapshot;
}

export async function runQianJiBaselineRebuild(input: { database: BaselineD1Database; canonical: NormalizedFinanceTransaction[]; interlocks: BaselineInterlocks; contract?: QianJiBaselineContract; now?: () => string }): Promise<BaselineRunResult> {
  const contract = input.contract ?? QIANJI_BASELINE_REBUILD_CONTRACT;
  const beforeRecords = await loadQianJiBaselineScope(input.database, contract);
  const before = createFinanceReconciliationSnapshot(beforeRecords);
  const preconditionHash = reconciliationPreconditionHash(beforeRecords);
  if (before.records !== contract.productionRows) block("production scoped row count differs");
  if (preconditionHash !== contract.preconditionHash) block("production precondition hash differs");
  assertManualAssetsEmpty(beforeRecords);
  const expectedAfter = createFinanceReconciliationSnapshot(canonicalRecords(input.canonical));
  assertExpectedSnapshot(expectedAfter, contract);
  const timestamp = input.now?.() ?? new Date().toISOString();
  const armed = input.interlocks.apply && input.interlocks.target === "production" && input.interlocks.confirm;
  if (!armed) return { mode: "DRY RUN", wrote: false, deleteCount: 0, insertCount: 0, preconditionHash, before, expectedAfter, timestamp };

  const deleteStatement = input.database.prepare(DELETE_SCOPED).bind(contract.source, contract.from, contract.toExclusive);
  const insertStatement = buildInsertStatement(input.database, input.canonical);
  let results: D1ResultLike[];
  try { results = await input.database.batch([deleteStatement, insertStatement]); }
  catch { throw new Error("BASELINE REBUILD FAILED: transactional D1 batch failed"); }
  if (results.length !== 2) throw new Error("BASELINE REBUILD FAILED: incomplete batch result");
  if (results[0]?.meta?.changes !== contract.productionRows) throw new Error("BASELINE REBUILD FAILED: delete count mismatch");
  const inserted = results[1]?.meta?.changes ?? 0;
  if (inserted !== contract.canonicalRecords) throw new Error("BASELINE REBUILD FAILED: insert count mismatch");

  const afterRecords = await loadQianJiBaselineScope(input.database, contract);
  let after: ReturnType<typeof createFinanceReconciliationSnapshot>;
  try { after = assertPostState(afterRecords, input.canonical, contract); }
  catch { throw new Error("POST-VERIFY FAILED: production state differs from canonical baseline"); }
  return { mode: "APPLIED", wrote: true, deleteCount: contract.productionRows, insertCount: contract.canonicalRecords, preconditionHash, before, expectedAfter, after, timestamp };
}

export const QIANJI_BASELINE_SQL = { select: SELECT_SCOPED, delete: DELETE_SCOPED, insertUsesJsonEach: true };
