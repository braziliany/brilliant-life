import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { Miniflare } from "miniflare";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import { QianJiJsonAdapter } from "../app/features/finance/adapters/qianji-json.ts";
import { createReconciliationD1Store } from "../app/features/finance/reconciliation-d1.ts";
import {
  applyReviewedReconciliation,
  buildReconciliationOperations,
  createFinanceReconciliationSnapshot,
  createReconciliationManifest,
  planQianJiReconciliation,
  reconciliationPreconditionHash,
  sha256,
} from "../app/features/finance/reconciliation.ts";

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
  note: "合成早餐",
  tags: ["synthetic"],
  lifeDomain: "food",
  ...overrides,
});

const stored = (id, sourceId, overrides = {}) => ({
  ...normalized(sourceId),
  id,
  lifeDomainOverride: null,
  semanticNote: "",
  personId: null,
  projectId: null,
  assetId: null,
  eventId: null,
  placeId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const fingerprint = (canonical, overrides = {}) => ({
  source: "qianji",
  from: "2026-01-01",
  to: "2026-09-01",
  filename: "synthetic-canonical.json",
  fileSize: 123,
  sha256: sha256(JSON.stringify(canonical)),
  parsedRecordCount: canonical.length,
  adapterCommit: "synthetic-commit",
  generatedAt: "2026-09-02T00:00:00.000Z",
  ...overrides,
});

function reviewedManifest(existing, canonical, edit = (resolution) => resolution) {
  const plan = planQianJiReconciliation({ existing, canonical, source: "qianji", from: "2026-01-01", to: "2026-09-01" });
  const value = createReconciliationManifest(fingerprint(canonical), plan, reconciliationPreconditionHash(existing.filter((record) => record.source === "qianji")));
  value.resolutions = value.resolutions.map((resolution) => edit({ ...resolution, reviewed: true }));
  return { plan, manifest: value };
}

test("planner separates exact updates, inserts, missing rows, rekey candidates, invalid canonical, and out-of-scope data", () => {
  const existing = [
    stored(1, "exact"),
    stored(2, "generated-old", { lifeDomainOverride: "family", semanticNote: "人工语义" }),
    stored(3, "missing", { occurredAt: "2026-04-01T08:00:00+08:00" }),
    stored(4, "outside", { occurredAt: "2025-12-31T08:00:00+08:00" }),
    stored(5, "other-source", { source: "synthetic-other" }),
  ];
  const canonical = [
    normalized("exact", { amountCents: 2_500 }),
    normalized("generated-new", { rawCategory: "娱乐", rawSubcategory: "电影", lifeDomain: "entertainment" }),
    normalized("insert", { occurredAt: "2026-07-01T08:00:00+08:00", note: "没有合理旧候选" }),
    normalized("outside-new", { occurredAt: "2026-10-01T08:00:00+08:00" }),
    { ...normalized("invalid"), lifeDomain: "not-valid" },
  ];
  const plan = planQianJiReconciliation({ existing, canonical, source: "qianji", from: "2026-01-01", to: "2026-09-01" });
  assert.equal(plan.bucketCounts.UPDATE, 1);
  assert.equal(plan.bucketCounts.POSSIBLE_REKEY, 1);
  assert.equal(plan.bucketCounts.INSERT, 1);
  assert.equal(plan.bucketCounts.MISSING_IN_CANONICAL, 1);
  assert.equal(plan.bucketCounts.INVALID_CANONICAL, 1);
  assert.equal(plan.bucketCounts.OUT_OF_SCOPE, 3);
  const rekey = plan.entries.find((entry) => entry.bucket === "POSSIBLE_REKEY");
  assert.equal(rekey.manualAssets.any, true);
  assert.equal(rekey.sourceIdGenerated, false);
  assert.ok(rekey.reasons.some((reason) => reason.includes("manual review")));
});

test("canonical duplicate identities are invalid and never become last-write-wins inserts", () => {
  const canonical = [normalized("duplicate"), normalized("duplicate", { amountCents: 9_999 })];
  const plan = planQianJiReconciliation({ existing: [], canonical, source: "qianji", from: "2026-01-01", to: "2026-09-01" });
  assert.equal(plan.bucketCounts.INVALID_CANONICAL, 2);
  assert.equal(plan.bucketCounts.INSERT, 0);
});

test("same facts under a different identity are only a possible duplicate, while multiple candidates remain ambiguous", () => {
  const duplicate = planQianJiReconciliation({
    existing: [stored(1, "old-id")],
    canonical: [normalized("new-id")],
    source: "qianji",
    from: "2026-01-01",
    to: "2026-09-01",
  });
  assert.equal(duplicate.bucketCounts.POSSIBLE_DUPLICATE, 1);
  const ambiguous = planQianJiReconciliation({
    existing: [stored(1, "old-a", { semanticNote: "人工语义" }), stored(2, "old-b")],
    canonical: [normalized("new-id", { rawCategory: "娱乐", lifeDomain: "entertainment" })],
    source: "qianji",
    from: "2026-01-01",
    to: "2026-09-01",
  });
  assert.equal(ambiguous.bucketCounts.AMBIGUOUS, 1);
  assert.equal(ambiguous.entries.find((entry) => entry.bucket === "AMBIGUOUS").candidateLevel, "AMBIGUOUS");
  assert.equal(ambiguous.entries.find((entry) => entry.bucket === "AMBIGUOUS").manualAssets.semanticNote, true);
});

test("manifest is private-review-first and apply gates review, fingerprint, precondition, collision, and production", async () => {
  const existing = [stored(1, "exact")];
  const canonical = [normalized("exact", { amountCents: 2_500 })];
  const plan = planQianJiReconciliation({ existing, canonical, source: "qianji", from: "2026-01-01", to: "2026-09-01" });
  const draft = createReconciliationManifest(fingerprint(canonical), plan, reconciliationPreconditionHash(existing));
  assert.match(draft.batchId, /^qianji-2026-01-01_2026-09-01-[0-9a-f]{8}$/);
  assert.equal(draft.resolutions[0].reviewed, false);
  assert.throws(() => buildReconciliationOperations(existing, canonical, draft), /reviewed/);

  const manifest = structuredClone(draft);
  manifest.resolutions[0].reviewed = true;
  assert.throws(() => buildReconciliationOperations([{ ...existing[0], amountCents: 9_999 }], canonical, manifest), /precondition changed/);
  const store = { atomicity: "bounded-checkpoint", loadScoped: async () => existing, applyOperations: async () => assert.fail("production must not execute") };
  await assert.rejects(() => applyReviewedReconciliation({ store, manifest, canonical, fingerprint: fingerprint(canonical), target: "production" }), /production reconciliation is disabled/);
  await assert.rejects(() => applyReviewedReconciliation({ store, manifest, canonical, fingerprint: fingerprint(canonical, { fileSize: 124 }), target: "isolated" }), /fingerprint changed/);
});

test("snapshot preserves accounting identity, refund sign, and excludes transfer and repayment", () => {
  const records = [
    stored(1, "expense", { amountCents: 10_000, lifeDomainOverride: "family" }),
    stored(2, "refund", { type: "refund", amountCents: 2_000, lifeDomainOverride: "family" }),
    stored(3, "income", { type: "income", amountCents: 50_000 }),
    stored(4, "transfer", { type: "transfer", amountCents: 40_000 }),
    stored(5, "repayment", { type: "repayment", amountCents: 30_000 }),
  ];
  const snapshot = createFinanceReconciliationSnapshot(records);
  assert.deepEqual(
    { records: snapshot.records, income: snapshot.incomeCents, gross: snapshot.grossExpenseCents, refund: snapshot.refundCents, net: snapshot.netExpenseCents, family: snapshot.familyCents },
    { records: 5, income: 50_000, gross: 10_000, refund: 2_000, net: 8_000, family: 8_000 },
  );
  assert.equal(snapshot.typeCounts.transfer, 1);
  assert.equal(snapshot.typeCounts.repayment, 1);
  assert.equal(snapshot.manualFieldCounts.lifeDomainOverride, 2);
  assert.match(snapshot.sourceIdSetHash, /^[0-9a-f]{64}$/);
  assert.match(snapshot.rowProjectionHash, /^[0-9a-f]{64}$/);
});

async function createD1() {
  const miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  const database = await miniflare.getD1Database("DB");
  await database.exec(`CREATE TABLE finance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, source_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL, type TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY', raw_type TEXT NOT NULL DEFAULT '',
    raw_category TEXT NOT NULL DEFAULT '', raw_subcategory TEXT NOT NULL DEFAULT '',
    account_from TEXT NOT NULL DEFAULT '', account_to TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
    life_domain TEXT NOT NULL DEFAULT 'other', life_domain_override TEXT,
    person_id INTEGER, project_id INTEGER, asset_id INTEGER, event_id INTEGER, place_id INTEGER,
    semantic_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(source, source_id)
  );`.replace(/\s+/g, " "));
  return { miniflare, database };
}

async function insertRecord(database, record) {
  await database.prepare(`INSERT INTO finance_transactions (
    id, source, source_id, occurred_at, type, amount_cents, currency, raw_type, raw_category,
    raw_subcategory, account_from, account_to, note, tags, life_domain, life_domain_override,
    person_id, project_id, asset_id, event_id, place_id, semantic_note, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    record.id, record.source, record.sourceId, record.occurredAt, record.type, record.amountCents,
    record.currency, record.rawType, record.rawCategory, record.rawSubcategory, record.accountFrom,
    record.accountTo, record.note, JSON.stringify(record.tags), record.lifeDomain, record.lifeDomainOverride,
    record.personId, record.projectId, record.assetId, record.eventId, record.placeId, record.semanticNote,
    record.createdAt, record.updatedAt,
  ).run();
}

test("isolated D1 apply updates, inserts, rekeys and deletes in one batch while preserving manual assets; checkpoint restores exact pre-state", { timeout: 120_000 }, async () => {
  const { miniflare, database } = await createD1();
  try {
    const existing = [
      stored(1, "exact"),
      stored(2, "generated-old", { lifeDomainOverride: "family", semanticNote: "人工说明", personId: 7, projectId: 8, assetId: 9, eventId: 10, placeId: 11 }),
      stored(3, "delete-me", { occurredAt: "2026-04-01T08:00:00+08:00" }),
    ];
    for (const record of existing) await insertRecord(database, record);
    const preHash = reconciliationPreconditionHash(existing);
    const canonical = [
      normalized("exact", { amountCents: 2_500, accountFrom: "修正账户" }),
      normalized("generated-new", { rawCategory: "娱乐", rawSubcategory: "电影", lifeDomain: "entertainment" }),
      normalized("insert", { occurredAt: "2026-07-01T08:00:00+08:00", type: "refund", amountCents: 500 }),
    ];
    const { manifest } = reviewedManifest(existing, canonical, (resolution) => {
      if (resolution.oldSourceId === "generated-old") return { ...resolution, action: "REKEY" };
      if (resolution.oldSourceId === "delete-me") return { ...resolution, action: "DELETE", reason: "synthetic reviewed deletion" };
      return resolution;
    });
    const store = createReconciliationD1Store(database);
    const result = await applyReviewedReconciliation({ store, manifest, canonical, fingerprint: fingerprint(canonical), target: "isolated" });
    assert.equal(result.atomicity, "transactional-batch");
    assert.equal(result.operationCount, 4);
    const after = await store.loadScoped("qianji", "2026-01-01", "2026-09-01");
    assert.deepEqual(after.map((record) => record.sourceId).sort(), ["exact", "generated-new", "insert"]);
    const rekeyed = after.find((record) => record.sourceId === "generated-new");
    assert.equal(rekeyed.id, 2);
    assert.equal(rekeyed.lifeDomainOverride, "family");
    assert.equal(rekeyed.semanticNote, "人工说明");
    assert.deepEqual([rekeyed.personId, rekeyed.projectId, rekeyed.assetId, rekeyed.eventId, rekeyed.placeId], [7, 8, 9, 10, 11]);
    assert.equal(rekeyed.lifeDomain, "entertainment");

    await database.prepare("DELETE FROM finance_transactions").run();
    for (const record of existing) await insertRecord(database, record);
    const restored = await store.loadScoped("qianji", "2026-01-01", "2026-09-01");
    assert.equal(reconciliationPreconditionHash(restored), preHash);
  } finally {
    await miniflare.dispose();
  }
});

test("a forged rekey into an existing identity blocks before any write", () => {
  const existing = [stored(1, "old"), stored(2, "new")];
  const canonical = [normalized("new", { amountCents: 2_500 })];
  const { manifest } = reviewedManifest(existing, canonical, (resolution) => resolution.oldSourceId === "old"
    ? { ...resolution, action: "REKEY", canonicalSourceId: "new" }
    : resolution);
  assert.throws(() => buildReconciliationOperations(existing, canonical, manifest), /resolution coverage is incomplete|rekey target identity already exists|precondition/);
});

const excelSerial = Date.UTC(2026, 0, 2, 8, 30) / 86_400_000 - Date.UTC(1899, 11, 30) / 86_400_000;
function numericDateWorkbook() {
  const headers = ["ID", "时间", "类型", "金额", "分类", "二级分类", "账户1", "备注"];
  const values = ["", excelSerial, "支出", 20, "三餐", "早餐", "合成钱包", "合成早餐"];
  const col = (index) => String.fromCharCode(65 + index);
  const row = (items, rowIndex) => `<row r="${rowIndex}">${items.map((value, index) => typeof value === "number"
    ? `<c r="${col(index)}${rowIndex}"><v>${value}</v></c>`
    : `<c r="${col(index)}${rowIndex}" t="inlineStr"><is><t>${value}</t></is></c>`).join("")}</row>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${row(headers, 1)}${row(values, 2)}</sheetData></worksheet>`;
  return zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet) });
}

test("numeric XLSX dates and +08:00 JSON dates expose the adapter identity risk but timezone-aware matching keeps a review candidate", async () => {
  const [excel] = await new QianJiExcelAdapter().parse(numericDateWorkbook());
  const [json] = await new QianJiJsonAdapter().parse([{
    时间: "2026-01-02 08:30:00", 类型: "支出", 金额: 20, 分类: "三餐", 二级分类: "早餐", 账户1: "合成钱包", 备注: "合成早餐",
  }]);
  assert.notEqual(excel.occurredAt, json.occurredAt);
  assert.notEqual(excel.sourceId, json.sourceId);
  assert.match(excel.sourceId, /^generated-[0-9a-f]+$/);
  assert.match(json.sourceId, /^generated-[0-9a-f]+$/);
  const plan = planQianJiReconciliation({
    existing: [stored(1, excel.sourceId, { ...excel })],
    canonical: [json],
    source: "qianji",
    from: "2026-01-01",
    to: "2026-09-01",
  });
  assert.equal(plan.bucketCounts.POSSIBLE_DUPLICATE + plan.bucketCounts.POSSIBLE_REKEY, 1);
  const candidate = plan.entries.find((entry) => ["POSSIBLE_DUPLICATE", "POSSIBLE_REKEY"].includes(entry.bucket));
  assert.equal(candidate.sourceIdGenerated, true);
  assert.ok(candidate.reasons.includes("same local date"));
});

test("CLI defaults to dry-run, emits a private review manifest, and never changes the scoped export", () => {
  const root = mkdtempSync(join(tmpdir(), "finance-reconcile-cli-"));
  try {
    const snapshotPath = join(root, "canonical.json");
    const existingPath = join(root, "existing.json");
    const outputPath = join(root, "private-output");
    writeFileSync(snapshotPath, JSON.stringify([{
      账单ID: "cli-synthetic",
      时间: "2026-03-01 08:00:00",
      类型: "支出",
      金额: 20,
      分类: "三餐",
      二级分类: "早餐",
      账户1: "合成钱包",
      备注: "合成早餐",
      标签: "synthetic",
    }]), "utf8");
    const before = JSON.stringify([stored(1, "cli-synthetic")], null, 2);
    writeFileSync(existingPath, before, "utf8");
    const output = execFileSync(process.execPath, [
      "scripts/finance-reconcile.mjs",
      "--source", "qianji",
      "--from", "2026-01-01",
      "--to", "2026-09-01",
      "--snapshot", snapshotPath,
      "--existing", existingPath,
      "--output", outputPath,
    ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.match(output, /"mode": "DRY RUN"/);
    assert.equal(readFileSync(existingPath, "utf8"), before);
    const [artifact] = readdirSync(outputPath);
    const dryRun = JSON.parse(readFileSync(join(outputPath, artifact), "utf8"));
    assert.match(dryRun.manifest.snapshotSha256, /^[0-9a-f]{64}$/);
    assert.equal(dryRun.manifest.resolutions.every((resolution) => resolution.reviewed === false), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
