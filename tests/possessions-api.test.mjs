import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";
import { handlePossessions } from "../app/features/possessions/api.ts";
import { createPossessionsStore } from "../app/features/possessions/store.ts";
import * as schema from "../db/schema.ts";
const today = "2026-10-26";
let runtime, d1, store;
before(async () => {
  runtime = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
  d1 = await runtime.getD1Database("DB");
  const migration = readFileSync(new URL("../drizzle/0016_possessions_phase1.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await d1.exec(statement.replace(/\s+/g, " "));
  store = createPossessionsStore(drizzle(d1, { schema }));
});
after(async () => { await runtime?.dispose(); });
const item = (patch = {}) => ({ name: "合成物品", category: "其他", ...patch });
async function api(resource, method, body, options = {}) {
  const url = options.url ?? "http://127.0.0.1/api/possessions";
  const headers = options.headers ?? { Origin: "http://127.0.0.1", "Content-Type": "application/json" };
  return handlePossessions(new Request(url, { method, headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }), resource, () => store, today);
}
const json = async (response, status) => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
const createItem = async (patch = {}) => (await json(await api("items", "POST", item(patch)), 201)).record;

test("possessions API: unauthorized and cross-origin writes are rejected before opening D1", async () => {
  let opened = 0;
  const unavailable = () => { opened++; throw Error("must not open"); };
  for (const url of ["https://pulse.sophier.org/api/possessions", "https://other.workers.dev/api/possessions"]) {
    const response = await handlePossessions(new Request(url), "overview", unavailable, today);
    assert.equal(response.status, 401);
  }
  for (const headers of [{}, { Origin: "https://evil.example.com", "Content-Type": "application/json" }]) {
    assert.equal((await handlePossessions(new Request("http://localhost/api/possessions/items", { method: "POST", headers, body: "{}" }), "items", unavailable, today)).status, 403);
  }
  assert.equal(opened, 0);
});
test("possessions API: malformed JSON, non-JSON, invalid fields and unsupported methods never write", async () => {
  const beforeCount = (await store.overview(today)).items.length;
  assert.equal((await api("items", "POST", "{")).status, 400);
  assert.equal((await api("items", "POST", "{}", { headers: { Origin: "http://127.0.0.1", "Content-Type": "text/plain" } })).status, 415);
  for (const body of [null, [], item({ purchasePriceCents: -1 }), item({ purchaseDate: "2026-02-30" }), item({ sourceWishId: 1 }), item({ status: "sold" })]) assert.equal((await api("items", "POST", body)).status, 400);
  assert.equal((await api("items", "DELETE", { id: 1 })).status, 405);
  assert.equal((await store.overview(today)).items.length, beforeCount);
});
test("possessions API + D1: create, read, edit, archive and restore preserve records", async () => {
  const created = await createItem();
  assert.equal(created.purchasePriceCents, null); assert.equal(created.purchaseDate, null);
  const updated = (await json(await api("items", "PUT", { ...item(), id: created.id, status: "idle", purchasePriceCents: 0 }), 200)).record;
  assert.equal(updated.purchasePriceCents, 0);
  await json(await api("items", "PATCH", { id: created.id, archived: true }), 200);
  let detail = await json(await api("overview", "GET", undefined, { url: `http://127.0.0.1/api/possessions?itemId=${created.id}` }), 200);
  assert.ok(detail.item.archivedAt); assert.equal(detail.item.status, "idle");
  await json(await api("items", "PATCH", { id: created.id, archived: false }), 200);
  detail = await store.detail(created.id, today); assert.equal(detail.item.archivedAt, null);
  assert.ok(created.createdAt); assert.ok(updated.updatedAt);
});
test("possessions API + D1: historical use create/update/delete derives totals with no redundant count", async () => {
  const created = await createItem({ purchasePriceCents: 10000, purchaseDate: "2026-01-01" });
  const first = (await json(await api("uses", "POST", { itemId: created.id, usedOn: "2025-12-31" }), 201)).record;
  assert.equal(first.count, 1);
  await json(await api("uses", "POST", { itemId: created.id, usedOn: "2026-10-20", count: 3, note: "合成补录" }), 201);
  let detail = await store.detail(created.id, today); assert.equal(detail.item.metrics.recordedUses, 4); assert.equal(detail.item.metrics.perUseCents, 2500);
  await json(await api("uses", "PUT", { id: first.id, itemId: created.id, usedOn: "2024-02-29", count: 2, note: "纠正误录" }), 200);
  assert.equal((await store.detail(created.id, today)).item.metrics.recordedUses, 5);
  await json(await api("uses", "DELETE", { id: first.id, itemId: created.id }), 200);
  detail = await store.detail(created.id, today); assert.equal(detail.item.metrics.recordedUses, 3); assert.equal(detail.uses.length, 1);
  await json(await api("items", "PATCH", { id: created.id, archived: true }), 200);
  assert.equal((await store.detail(created.id, today)).item.metrics.recordedUses, 3);
});
test("possessions API + D1: invalid relationship IDs cannot create or move usage", async () => {
  assert.equal((await api("uses", "POST", { itemId: 999999, usedOn: today })).status, 404);
  const a = await createItem(), b = await createItem();
  const use = (await json(await api("uses", "POST", { itemId: a.id, usedOn: today }), 201)).record;
  assert.equal((await api("uses", "PUT", { id: use.id, itemId: b.id, usedOn: today, count: 2 })).status, 404);
  assert.equal((await api("uses", "DELETE", { id: use.id, itemId: b.id })).status, 404);
  assert.equal((await store.detail(a.id, today)).uses[0].count, 1);
  assert.equal((await store.detail(b.id, today)).uses.length, 0);
  await assert.rejects(d1.prepare("INSERT INTO possession_uses (item_id,used_on) VALUES (999999,'2026-10-01')").run());
  await assert.rejects(d1.prepare("DELETE FROM possession_items WHERE id=?").bind(a.id).run());
});
test("possessions API + D1: all exit statuses retain exact end dates and stop holding costs", async () => {
  for (const status of ["sold", "gifted", "retired"]) {
    const created = await createItem({ status, purchaseDate: "2026-10-01", endedDate: "2026-10-10", purchasePriceCents: 10000 });
    const detail = await store.detail(created.id, today); assert.equal(detail.item.metrics.holdingDays, 10); assert.equal(detail.item.metrics.perDayCents, 1000);
  }
});
test("possessions API + D1: wish conversion is explicit, price is not budget and source cannot orphan", async () => {
  const wish = (await json(await api("wishes", "POST", { name: "合成愿望", budgetCents: 19900, plannedDate: "2027-01-01" }), 201)).record;
  assert.equal((await api("convert", "POST", { wishId: wish.id, item: item() })).status, 409);
  await json(await api("wishes", "PUT", { id: wish.id, name: wish.name, budgetCents: 19900, status: "purchased" }), 200);
  const converted = (await json(await api("convert", "POST", { wishId: wish.id, item: item() }), 201)).item;
  assert.equal(converted.purchasePriceCents, null); assert.equal(converted.sourceWishId, wish.id); assert.equal(converted.purchaseDate, null);
  assert.equal((await api("convert", "POST", { wishId: wish.id, item: item() })).status, 409);
  assert.equal((await api("wishes", "PUT", { id: wish.id, name: wish.name, status: "cancelled" })).status, 409);
  await assert.rejects(d1.prepare("DELETE FROM possession_wishes WHERE id=?").bind(wish.id).run());
});
test("possessions API + D1: concurrent conversion produces only one archive item", async () => {
  const wish = (await json(await api("wishes", "POST", { name: "合成并发愿望", status: "purchased", budgetCents: 5000 }), 201)).record;
  const responses = await Promise.all([api("convert", "POST", { wishId: wish.id, item: item({ purchasePriceCents: 0 }) }), api("convert", "POST", { wishId: wish.id, item: item({ purchasePriceCents: 0 }) })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal((await store.overview(today)).items.filter(i => i.sourceWishId === wish.id).length, 1);
});
test("possessions API: strict queries, IDs and missing entities return bounded errors", async () => {
  for (const query of ["?itemId=0", "?itemId=-1", "?itemId=1.5", "?itemId=x", "?itemId=1&itemId=2", "?year=2026"]) assert.equal((await api("overview", "GET", undefined, { url: `http://127.0.0.1/api/possessions${query}` })).status, 400);
  assert.equal((await api("overview", "GET", undefined, { url: "http://127.0.0.1/api/possessions?itemId=999999" })).status, 404);
  for (const id of [0, -1, "1", 1.5]) assert.equal((await api("items", "PUT", { ...item(), id })).status, 400);
  assert.equal((await api("items", "PUT", { ...item(), id: 999999 })).status, 404);
  assert.equal((await api("convert", "POST", { wishId: 999999, item: item() })).status, 404);
});
test("possessions API: storage failures return no-store 500 without internal diagnostics", async () => {
  const response = await handlePossessions(new Request("http://localhost/api/possessions"), "overview", () => { throw Error("private SQL path"); }, today);
  assert.equal(response.status, 500); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.doesNotMatch(await response.text(), /private SQL path/);
});
