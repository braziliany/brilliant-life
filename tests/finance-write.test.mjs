import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";

import { financeTransactions } from "../db/schema.ts";
import { effectiveLifeDomain } from "../app/features/finance/domain.ts";
import { importFinanceTransactions, toFinanceRecord } from "../app/features/finance/import-service.ts";
import { handleFinanceOverrideMutation, readFinanceOverrideMutation, updateFinanceLifeDomainOverride } from "../app/features/finance/write-service.ts";

const incoming = (overrides = {}) => ({
  source: "qianji",
  sourceId: "synthetic-write-1",
  occurredAt: "2026-08-20T12:00:00+08:00",
  type: "expense",
  amountCents: 2_000,
  currency: "CNY",
  rawType: "支出",
  rawCategory: "三餐",
  rawSubcategory: "午餐",
  accountFrom: "合成钱包",
  accountTo: "",
  note: "合成午餐",
  tags: [],
  lifeDomain: "food",
  ...overrides,
});

async function createFinanceDb() {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const d1 = await miniflare.getD1Database("DB");
  const schemaSql = `CREATE TABLE finance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    raw_type TEXT NOT NULL DEFAULT '',
    raw_category TEXT NOT NULL DEFAULT '',
    raw_subcategory TEXT NOT NULL DEFAULT '',
    account_from TEXT NOT NULL DEFAULT '',
    account_to TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    life_domain TEXT NOT NULL DEFAULT 'other',
    life_domain_override TEXT,
    person_id INTEGER,
    project_id INTEGER,
    asset_id INTEGER,
    event_id INTEGER,
    place_id INTEGER,
    semantic_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_id)
  );`;
  await d1.exec(schemaSql.replace(/\s+/g, " "));
  return { miniflare, db: drizzle(d1, { schema: { financeTransactions } }) };
}

test("finance override payload accepts only id and the official domain or null", () => {
  assert.deepEqual(readFinanceOverrideMutation({ id: 1, lifeDomainOverride: "transport" }), { id: 1, lifeDomainOverride: "transport" });
  assert.deepEqual(readFinanceOverrideMutation({ id: 1, lifeDomainOverride: null }), { id: 1, lifeDomainOverride: null });
  for (const value of [
    null,
    {},
    { id: 0, lifeDomainOverride: "food" },
    { id: Number.MAX_SAFE_INTEGER + 1, lifeDomainOverride: "food" },
    { id: 1 },
    { lifeDomainOverride: "food" },
    { id: 1, lifeDomainOverride: "not-a-domain" },
    { id: 1, lifeDomainOverride: "food", amountCents: 1 },
    { id: 1, lifeDomainOverride: "food", semanticNote: "no" },
  ]) assert.equal(readFinanceOverrideMutation(value), null);
});

test("real D1 conflict updates preserve override and semantic note while automatic classification changes", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createFinanceDb();
  try {
    await db.insert(financeTransactions).values({
      ...incoming(),
      tags: "[]",
      lifeDomainOverride: "daily_life",
      semanticNote: "人工说明",
      updatedAt: "2026-08-20T12:00:00.000Z",
    });

    const repeated = await importFinanceTransactions(db, [incoming()]);
    assert.deepEqual(repeated, { read: 1, inserted: 0, updated: 0, skipped: 1, failed: 0 });
    let [row] = await db.select().from(financeTransactions);
    assert.equal(row.lifeDomainOverride, "daily_life");
    assert.equal(row.semanticNote, "人工说明");

    const changed = incoming({ rawCategory: "娱乐", rawSubcategory: "电影", note: "合成电影", lifeDomain: "entertainment" });
    const updated = await importFinanceTransactions(db, [changed]);
    assert.deepEqual(updated, { read: 1, inserted: 0, updated: 1, skipped: 0, failed: 0 });
    [row] = await db.select().from(financeTransactions);
    assert.equal(row.lifeDomain, "entertainment");
    assert.equal(row.lifeDomainOverride, "daily_life");
    assert.equal(row.semanticNote, "人工说明");
    assert.equal(effectiveLifeDomain(toFinanceRecord(row)), "daily_life");

    const cleared = await updateFinanceLifeDomainOverride(db, { id: row.id, lifeDomainOverride: null });
    assert.equal(cleared.changed, true);
    assert.equal(cleared.transaction.effectiveLifeDomain, "entertainment");
    assert.equal(cleared.transaction.lifeDomainOverride, null);
  } finally {
    await miniflare.dispose();
  }
});

test("same override and null override are no-ops that preserve updatedAt", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createFinanceDb();
  try {
    const [overrideRow] = await db.insert(financeTransactions).values({ ...incoming(), sourceId: "override", tags: "[]", lifeDomainOverride: "transport", updatedAt: "2026-08-01T00:00:00.000Z" }).returning();
    const same = await updateFinanceLifeDomainOverride(db, { id: overrideRow.id, lifeDomainOverride: "transport" });
    assert.equal(same.changed, false);
    let [stored] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, overrideRow.id));
    assert.equal(stored.updatedAt, "2026-08-01T00:00:00.000Z");

    const [automaticRow] = await db.insert(financeTransactions).values({ ...incoming(), sourceId: "automatic", tags: "[]", lifeDomainOverride: null, updatedAt: "2026-08-02T00:00:00.000Z" }).returning();
    const nullNoop = await updateFinanceLifeDomainOverride(db, { id: automaticRow.id, lifeDomainOverride: null });
    assert.equal(nullNoop.changed, false);
    [stored] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, automaticRow.id));
    assert.equal(stored.updatedAt, "2026-08-02T00:00:00.000Z");
  } finally {
    await miniflare.dispose();
  }
});

test("missing finance transaction returns not found without creating data", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createFinanceDb();
  try {
    assert.equal(await updateFinanceLifeDomainOverride(db, { id: 404, lifeDomainOverride: "food" }), null);
    assert.deepEqual(await db.select().from(financeTransactions), []);
  } finally {
    await miniflare.dispose();
  }
});

test("finance mutation handler returns bounded validation, not-found, success, and generic errors", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createFinanceDb();
  const request = (body, contentType = "application/json") => new Request("http://localhost/api/finance", {
    method: "PATCH",
    headers: { "Content-Type": contentType },
    body,
  });
  try {
    assert.equal((await handleFinanceOverrideMutation(request("{}", "text/plain"), db)).status, 415);
    assert.equal((await handleFinanceOverrideMutation(request("{"), db)).status, 400);
    for (const body of [
      {},
      { id: 0, lifeDomainOverride: "food" },
      { id: Number.MAX_SAFE_INTEGER + 1, lifeDomainOverride: "food" },
      { id: 1 },
      { id: 1, lifeDomainOverride: "invalid" },
      { id: 1, lifeDomainOverride: "food", note: "blocked" },
    ]) assert.equal((await handleFinanceOverrideMutation(request(JSON.stringify(body)), db)).status, 400);
    assert.equal((await handleFinanceOverrideMutation(request(JSON.stringify({ id: 404, lifeDomainOverride: "food" })), db)).status, 404);

    const [row] = await db.insert(financeTransactions).values({ ...incoming(), tags: "[]", lifeDomainOverride: null }).returning();
    const response = await handleFinanceOverrideMutation(request(JSON.stringify({ id: row.id, lifeDomainOverride: "transport" })), db);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.changed, true);
    assert.equal(payload.transaction.id, row.id);
    assert.equal(payload.transaction.lifeDomainOverride, "transport");
    assert.equal(payload.transaction.effectiveLifeDomain, "transport");
    for (const key of ["personId", "projectId", "assetId", "eventId", "placeId", "createdAt", "updatedAt"]) assert.equal(key in payload.transaction, false);

    const failed = await handleFinanceOverrideMutation(request(JSON.stringify({ id: row.id, lifeDomainOverride: "food" })), { select() { throw new Error("private database detail"); } });
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "Finance classification update failed" });
  } finally {
    await miniflare.dispose();
  }
});
