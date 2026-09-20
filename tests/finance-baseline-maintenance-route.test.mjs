import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createFinanceReconciliationSnapshot, reconciliationPreconditionHash } from "../app/features/finance/reconciliation.ts";
import {
  QIANJI_BASELINE_CONFIRMATION,
  handleQianJiBaselineMaintenance,
  qianJiBaselineMaintenanceMethodNotAllowed,
} from "../app/features/finance/qianji-baseline-maintenance.ts";
import {
  QIANJI_BASELINE_SQL,
  createQianJiBaselineExecutionAsset,
} from "../scripts/qianji-baseline-rebuild.ts";

const routeSource = readFileSync(new URL("../app/api/internal/qianji-baseline-rebuild/route.ts", import.meta.url), "utf8");

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

function fixture(existing, canonical) {
  const expected = createFinanceReconciliationSnapshot(asStoredCanonical(canonical));
  const dates = canonical.map((item) => item.occurredAt).sort();
  const contract = {
    source: "qianji",
    from: "2026-01-01T00:00:00+08:00",
    toExclusive: "2026-09-01T00:00:00+08:00",
    firstOccurredAt: dates[0],
    lastOccurredAt: dates.at(-1),
    canonicalSha256: "a".repeat(64),
    executionAssetSha256: "",
    canonicalRecords: canonical.length,
    productionRows: existing.length,
    preconditionHash: reconciliationPreconditionHash(existing),
    sourceIdSetHash: expected.sourceIdSetHash,
    databaseName: "synthetic-db",
    databaseId: "synthetic-id",
    typeCounts: expected.typeCounts,
    accounting: {
      incomeCents: expected.incomeCents,
      grossExpenseCents: expected.grossExpenseCents,
      refundCents: expected.refundCents,
      netExpenseCents: expected.netExpenseCents,
      familyCents: expected.familyCents,
      personalCents: expected.personalCents,
    },
  };
  const initialAsset = createQianJiBaselineExecutionAsset(canonical, contract);
  contract.executionAssetSha256 = initialAsset.executionAssetSha256;
  return { contract, asset: createQianJiBaselineExecutionAsset(canonical, contract) };
}

function fakeDatabase(initial, options = {}) {
  let rows = initial.map(toRow);
  let batchCalls = 0;
  const prepared = [];
  return {
    prepare(sql) {
      const statement = {
        sql,
        bindings: [],
        bind(...bindings) { this.bindings = bindings; return this; },
        async all() {
          if (sql.includes("COUNT(*) AS total")) {
            const qianji = options.qianjiCount ?? rows.filter((row) => row.source === "qianji").length;
            return { results: [{ total: options.totalCount ?? rows.length, qianji }] };
          }
          return { results: rows };
        },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      batchCalls += 1;
      this.lastBatch = statements;
      if (options.failBatch) throw new Error("synthetic batch failure");
      const canonical = JSON.parse(statements[1].bindings[0]);
      rows = asStoredCanonical(canonical).map(toRow);
      return [{ meta: { changes: initial.length } }, { meta: { changes: canonical.length } }];
    },
    get prepared() { return prepared; },
    get batchCalls() { return batchCalls; },
    lastBatch: [],
  };
}

function request(asset, overrides = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Cf-Access-Jwt-Assertion": "access-protected",
    "X-Maintenance-Key": "maintenance-secret",
    "X-Maintenance-Confirm": QIANJI_BASELINE_CONFIRMATION,
    ...overrides.headers,
  };
  for (const name of overrides.removeHeaders ?? []) delete headers[name];
  return new Request(overrides.url ?? "https://pulse.sophier.org/api/internal/qianji-baseline-rebuild", {
    method: "POST",
    headers,
    body: overrides.body ?? JSON.stringify(asset),
  });
}

function dependencies(database, contract) {
  return { database, contract, maintenanceKey: "maintenance-secret", databaseId: contract.databaseId, now: () => "2026-09-21T12:00:00.000Z" };
}

test("temporary route is POST-only and exposes no read handler", async () => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const response = qianJiBaselineMaintenanceMethodNotAllowed();
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("Allow"), "POST", method);
  }
  assert.match(routeSource, /export function POST\(request: Request\)/);
  assert.match(routeSource, /export const GET = qianJiBaselineMaintenanceMethodNotAllowed/);
  assert.doesNotMatch(routeSource, /export async function GET|db\.select|financeTransactions/);
});

test("Access and application secrets fail closed before any database read", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const { contract, asset } = fixture(existing, canonical);
  for (const current of [
    request(asset, { removeHeaders: ["Cf-Access-Jwt-Assertion"] }),
    request(asset, { removeHeaders: ["X-Maintenance-Key"] }),
    request(asset, { headers: { "X-Maintenance-Key": "wrong" } }),
  ]) {
    const database = fakeDatabase(existing);
    const response = await handleQianJiBaselineMaintenance(current, dependencies(database, contract));
    assert.ok([401, 403].includes(response.status));
    assert.equal(database.prepared.length, 0);
    assert.equal(database.batchCalls, 0);
    assert.doesNotMatch(JSON.stringify(await response.json()), /maintenance-secret|access-protected/);
  }
});

test("confirmation, JSON content type, and database identity are mandatory", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const { contract, asset } = fixture(existing, canonical);
  const database = fakeDatabase(existing);
  const missingConfirmation = await handleQianJiBaselineMaintenance(request(asset, { removeHeaders: ["X-Maintenance-Confirm"] }), dependencies(database, contract));
  assert.equal(missingConfirmation.status, 400);
  const wrongType = await handleQianJiBaselineMaintenance(request(asset, { headers: { "Content-Type": "text/plain" } }), dependencies(database, contract));
  assert.equal(wrongType.status, 415);
  const wrongDatabase = await handleQianJiBaselineMaintenance(request(asset), { ...dependencies(database, contract), databaseId: "wrong" });
  assert.equal(wrongDatabase.status, 503);
  assert.equal(database.batchCalls, 0);
});

test("production counts reject 1100, 1132, and any non-QianJi row before writes", async () => {
  const existing = Array.from({ length: 1099 }, (_, index) => stored(index + 1, `old-${index}`));
  const canonical = [normalized("canonical")];
  const { contract, asset } = fixture(existing, canonical);
  for (const counts of [{ totalCount: 1100, qianjiCount: 1100 }, { totalCount: 1132, qianjiCount: 1132 }, { totalCount: 1100, qianjiCount: 1099 }]) {
    const database = fakeDatabase(existing, counts);
    const response = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
    assert.equal(response.status, 409);
    assert.equal(database.batchCalls, 0);
  }
});

test("canonical asset hash, sourceId fingerprint, and record count mismatches reject before writes", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const { contract, asset } = fixture(existing, canonical);
  for (const mutate of [
    (copy) => { copy.executionAssetSha256 = "0".repeat(64); },
    (copy) => { copy.payload.sourceIdSetHash = "0".repeat(64); },
    (copy) => { copy.payload.records += 1; },
  ]) {
    const changed = structuredClone(asset);
    mutate(changed);
    const database = fakeDatabase(existing);
    const response = await handleQianJiBaselineMaintenance(request(changed), dependencies(database, contract));
    assert.equal(response.status, 400);
    assert.equal(database.batchCalls, 0);
  }
});

test("generated and duplicate canonical identities reject even when their asset hash is internally consistent", async () => {
  const existing = [stored(1, "old")];
  for (const canonical of [
    [normalized("generated-deadbeef")],
    [normalized("duplicate"), normalized("duplicate")],
  ]) {
    const { contract, asset } = fixture(existing, canonical);
    const database = fakeDatabase(existing);
    const response = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
    assert.equal(response.status, 400);
    assert.equal(database.batchCalls, 0);
  }
});

test("every manual semantic or relation asset blocks before the transactional batch", async () => {
  const variants = [
    { lifeDomainOverride: "family" },
    { semanticNote: "人工说明" },
    { personId: 1 },
    { projectId: 1 },
    { assetId: 1 },
    { eventId: 1 },
    { placeId: 1 },
  ];
  for (const values of variants) {
    const existing = [stored(1, "old", values)];
    const canonical = [normalized("canonical")];
    const { contract, asset } = fixture(existing, canonical);
    const database = fakeDatabase(existing);
    const response = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
    assert.equal(response.status, 500);
    assert.equal(database.batchCalls, 0);
  }
});

test("eligible request uses one transactional D1 batch with scoped delete and exactly 1132 canonical rows", async () => {
  const existing = Array.from({ length: 1099 }, (_, index) => stored(index + 1, `old-${index}`));
  const canonical = Array.from({ length: 1132 }, (_, index) => normalized(`qj-${index}`, { occurredAt: `2026-${String(Math.min(8, Math.floor(index / 150) + 1)).padStart(2, "0")}-01T08:00:00+08:00` }));
  const { contract, asset } = fixture(existing, canonical);
  const database = fakeDatabase(existing);
  const response = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
  assert.equal(response.status, 200);
  assert.equal(database.batchCalls, 1);
  assert.equal(database.lastBatch.length, 2);
  assert.match(database.lastBatch[0].sql, /^DELETE FROM finance_transactions/);
  assert.deepEqual(database.lastBatch[0].bindings, ["qianji", contract.from, contract.toExclusive]);
  assert.match(database.lastBatch[1].sql, /^INSERT INTO finance_transactions/);
  assert.match(database.lastBatch[1].sql, /FROM json_each\(\?\)/);
  assert.equal(JSON.parse(database.lastBatch[1].bindings[0]).length, 1132);
  assert.equal(database.lastBatch.some((statement) => /\bUPDATE\b|\bALTER\b|\bDROP\b/i.test(statement.sql)), false);
  assert.equal(QIANJI_BASELINE_SQL.insertUsesJsonEach, true);
  const payload = await response.json();
  assert.equal(payload.insertedRows, 1132);
  assert.equal(payload.deletedRows, 1099);
  assert.equal("transactions" in payload, false);
});

test("batch failure is generic and can never report success", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical")];
  const { contract, asset } = fixture(existing, canonical);
  const database = fakeDatabase(existing, { failBatch: true });
  const response = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Baseline execution failed" });
  assert.equal(database.batchCalls, 1);
});

test("successful mocked execution closes the one-shot gate for a second call", async () => {
  const existing = [stored(1, "old")];
  const canonical = [normalized("canonical-a"), normalized("canonical-b")];
  const { contract, asset } = fixture(existing, canonical);
  const database = fakeDatabase(existing);
  const first = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
  assert.equal(first.status, 200);
  const second = await handleQianJiBaselineMaintenance(request(asset), dependencies(database, contract));
  assert.equal(second.status, 409);
  assert.equal(database.batchCalls, 1);
});
