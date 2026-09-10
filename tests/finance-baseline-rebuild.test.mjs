import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Miniflare } from "miniflare";

import { createFinanceReconciliationSnapshot, reconciliationPreconditionHash, sha256 } from "../app/features/finance/reconciliation.ts";
import {
  QIANJI_BASELINE_SQL,
  runQianJiBaselineRebuild,
  validateQianJiBaselineCanonical,
} from "../scripts/qianji-baseline-rebuild.ts";

const normalized = (sourceId, overrides = {}) => ({
  source: "qianji",
  sourceId,
  occurredAt: "2026-03-01T08:00:00+08:00",
  type: "expense",
  amountCents: 2_000,
  currency: "CNY",
  rawType: "支出",
  rawCategory: "三餐",
  rawSubcategory: "早餐",
  accountFrom: "合成钱包",
  accountTo: "",
  note: "合成记录",
  tags: ["synthetic"],
  lifeDomain: "food",
  ...overrides,
});

const stored = (id, sourceId, overrides = {}) => ({
  ...normalized(sourceId),
  id,
  lifeDomainOverride: null,
  personId: null,
  projectId: null,
  assetId: null,
  eventId: null,
  placeId: null,
  semanticNote: "",
  ...overrides,
});

const toRow = (item) => ({
  id: item.id,
  source: item.source,
  source_id: item.sourceId,
  occurred_at: item.occurredAt,
  type: item.type,
  amount_cents: item.amountCents,
  currency: item.currency,
  raw_type: item.rawType,
  raw_category: item.rawCategory,
  raw_subcategory: item.rawSubcategory,
  account_from: item.accountFrom,
  account_to: item.accountTo,
  note: item.note,
  tags: JSON.stringify(item.tags),
  life_domain: item.lifeDomain,
  life_domain_override: item.lifeDomainOverride,
  person_id: item.personId,
  project_id: item.projectId,
  asset_id: item.assetId,
  event_id: item.eventId,
  place_id: item.placeId,
  semantic_note: item.semanticNote,
});

function asStoredCanonical(canonical) {
  return canonical.map((item, index) => stored(index + 1, item.sourceId, item));
}

function contract(existing, canonical, bytes = new Uint8Array([1, 2, 3])) {
  const snapshot = createFinanceReconciliationSnapshot(asStoredCanonical(canonical));
  const dates = canonical.map((item) => item.occurredAt).sort();
  return {
    source: "qianji",
    from: "2026-01-01T00:00:00+08:00",
    toExclusive: "2026-09-01T00:00:00+08:00",
    firstOccurredAt: dates[0],
    lastOccurredAt: dates.at(-1),
    canonicalSha256: sha256(bytes),
    canonicalRecords: canonical.length,
    productionRows: existing.length,
    preconditionHash: reconciliationPreconditionHash(existing),
    sourceIdSetHash: snapshot.sourceIdSetHash,
    databaseName: "synthetic-db",
    databaseId: "synthetic-id",
    typeCounts: snapshot.typeCounts,
    accounting: {
      incomeCents: snapshot.incomeCents,
      grossExpenseCents: snapshot.grossExpenseCents,
      refundCents: snapshot.refundCents,
      netExpenseCents: snapshot.netExpenseCents,
      familyCents: snapshot.familyCents,
      personalCents: snapshot.personalCents,
    },
  };
}

function fakeDatabase(initial, postRows = initial, options = {}) {
  let rows = initial.map(toRow);
  const prepared = [];
  let batchCalls = 0;
  return {
    prepare(sql) {
      const statement = {
        sql,
        bindings: [],
        bind(...bindings) { this.bindings = bindings; return this; },
        async all() { return { results: rows }; },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      batchCalls += 1;
      this.lastBatch = statements;
      if (options.failBatch) throw new Error("synthetic batch failure");
      if (options.mutate !== false) rows = postRows.map(toRow);
      return statements.map((statement, index) => ({ meta: { changes: index === 0 ? initial.length : JSON.parse(statement.bindings[0]).length } }));
    },
    get prepared() { return prepared; },
    get batchCalls() { return batchCalls; },
    lastBatch: [],
  };
}

async function createD1() {
  const miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  const database = await miniflare.getD1Database("DB");
  await database.exec(`CREATE TABLE finance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, source_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL, type TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY', raw_type TEXT NOT NULL DEFAULT '',
    raw_category TEXT NOT NULL DEFAULT '', raw_subcategory TEXT NOT NULL DEFAULT '',
    account_from TEXT NOT NULL DEFAULT '', account_to TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]', life_domain TEXT NOT NULL DEFAULT 'other', life_domain_override TEXT,
    person_id INTEGER, project_id INTEGER, asset_id INTEGER, event_id INTEGER, place_id INTEGER,
    semantic_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(source, source_id)
  );`.replace(/\s+/g, " "));
  return { miniflare, database };
}

async function insertRecord(database, record) {
  const row = toRow(record);
  await database.prepare(`INSERT INTO finance_transactions (
    id, source, source_id, occurred_at, type, amount_cents, currency, raw_type, raw_category,
    raw_subcategory, account_from, account_to, note, tags, life_domain, life_domain_override,
    person_id, project_id, asset_id, event_id, place_id, semantic_note
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    row.id, row.source, row.source_id, row.occurred_at, row.type, row.amount_cents, row.currency,
    row.raw_type, row.raw_category, row.raw_subcategory, row.account_from, row.account_to, row.note,
    row.tags, row.life_domain, row.life_domain_override, row.person_id, row.project_id, row.asset_id,
    row.event_id, row.place_id, row.semantic_note,
  ).run();
}

const armed = { apply: true, target: "production", confirm: true };
const dry = { apply: false, target: undefined, confirm: false };

test("admin config locks the remote production D1 identity", () => {
  const config = JSON.parse(readFileSync(new URL("../scripts/qianji-baseline-rebuild.wrangler.json", import.meta.url), "utf8"));
  assert.deepEqual(config.d1_databases, [{
    binding: "DB",
    database_name: "pulse-health-dashboard-db",
    database_id: "556b490d-99c9-4901-bffc-ee0b8c2f8a62",
    remote: true,
  }]);
});

test("dry-run never writes", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const database = fakeDatabase(existing);
  const result = await runQianJiBaselineRebuild({ database, canonical, interlocks: dry, contract: contract(existing, canonical) });
  assert.equal(result.mode, "DRY RUN");
  assert.equal(result.wrote, false);
  assert.equal(database.batchCalls, 0);
});

test("wrong canonical SHA blocks", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const canonical = [normalized("canonical")];
  const validation = { source: "qianji", format: "xlsx", valid: true, records: 1, duplicateIds: 0, invalidRecords: 0, issues: [], transactions: canonical };
  const expected = contract([], canonical, bytes);
  assert.throws(() => validateQianJiBaselineCanonical(bytes, validation, { ...expected, canonicalSha256: "0".repeat(64) }), /canonical SHA-256 differs/);
});

test("wrong production precondition blocks before batch", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const database = fakeDatabase(existing);
  await assert.rejects(runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: { ...contract(existing, canonical), preconditionHash: "wrong" } }), /precondition hash differs/);
  assert.equal(database.batchCalls, 0);
});

test("manual assets block before batch", async () => {
  const existing = [stored(1, "old", { lifeDomainOverride: "family" })];
  const canonical = [normalized("canonical")];
  const database = fakeDatabase(existing);
  await assert.rejects(runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) }), /lifeDomainOverride assets exist/);
  assert.equal(database.batchCalls, 0);
});

test("delete is strictly scoped and excludes September", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const database = fakeDatabase(existing, asStoredCanonical(canonical));
  await runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) });
  const statement = database.lastBatch[0];
  assert.match(statement.sql, /source = \? AND occurred_at >= \? AND occurred_at < \?/);
  assert.deepEqual(statement.bindings, ["qianji", "2026-01-01T00:00:00+08:00", "2026-09-01T00:00:00+08:00"]);
  assert.equal(QIANJI_BASELINE_SQL.delete.includes("DELETE FROM finance_transactions"), true);
});

test("one transactional batch contains the delete and every canonical insert", async () => {
  const existing = [stored(1, "old")];
  const canonical = Array.from({ length: 1132 }, (_, index) => normalized(`qj-${index}`, { occurredAt: `2026-${String(Math.floor(index / 150) + 1).padStart(2, "0")}-01T08:00:00+08:00` }));
  const database = fakeDatabase(existing, asStoredCanonical(canonical));
  const result = await runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) });
  assert.equal(database.batchCalls, 1);
  assert.equal(database.lastBatch.length, 2);
  assert.equal(QIANJI_BASELINE_SQL.insertUsesJsonEach, true);
  assert.match(database.lastBatch[1].sql, /FROM json_each\(\?\)/);
  assert.equal(JSON.parse(database.lastBatch[1].bindings[0]).length, 1132);
  assert.equal(result.insertCount, 1132);
});

test("transactional batch failure reports failure", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const database = fakeDatabase(existing, existing, { failBatch: true });
  await assert.rejects(runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) }), /transactional D1 batch failed/);
});

test("post-state mismatch reports failure", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const database = fakeDatabase(existing, existing, { mutate: false });
  await assert.rejects(runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) }), /POST-VERIFY FAILED/);
});

test("local D1 executes the replacement and verifies the canonical state", { timeout: 120_000 }, async () => {
  const { miniflare, database } = await createD1();
  try {
    const existing = [stored(1, "old")];
    await insertRecord(database, existing[0]);
    const canonical = Array.from({ length: 8 }, (_, index) => normalized(`canonical-${index}`, { amountCents: 1_000 + index }));
    const result = await runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) });
    assert.equal(result.mode, "APPLIED");
    assert.equal(result.after.records, 8);
    assert.equal(result.after.sourceIdSetHash, result.expectedAfter.sourceIdSetHash);
  } finally {
    await miniflare.dispose();
  }
});

test("local D1 rolls the scoped delete back when any insert fails", { timeout: 120_000 }, async () => {
  const { miniflare, database } = await createD1();
  try {
    const existing = [stored(1, "old")];
    const september = stored(2, "canonical", { occurredAt: "2026-09-02T08:00:00+08:00" });
    await insertRecord(database, existing[0]);
    await insertRecord(database, september);
    const canonical = [normalized("canonical")];
    await assert.rejects(runQianJiBaselineRebuild({ database, canonical, interlocks: armed, contract: contract(existing, canonical) }), /transactional D1 batch failed/);
    const rows = await database.prepare("SELECT source_id, occurred_at FROM finance_transactions ORDER BY id").all();
    assert.deepEqual(rows.results, [
      { source_id: "old", occurred_at: "2026-03-01T08:00:00+08:00" },
      { source_id: "canonical", occurred_at: "2026-09-02T08:00:00+08:00" },
    ]);
  } finally {
    await miniflare.dispose();
  }
});
