import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { itemMetrics, recordedUsesThrough, formatCost, yuanToCents, shanghaiToday } from "../app/features/possessions/domain.ts";
import { parseItem, parseUse, parseWish } from "../app/features/possessions/validation.ts";
import { itemPayload, wishPayload, usePayload } from "../app/features/possessions/payload.ts";
const today = "2026-10-26";
const item = (patch = {}) => ({ name: "合成耳机", category: "数码", purchaseDate: "2026-10-01", purchasePriceCents: 10000, status: "in_use", endedDate: null, ...patch });

test("possessions payload: read-model metadata never becomes writable form state or request fields", () => {
  const metadata = { id: 17, createdAt: today, updatedAt: today, archivedAt: today, sourceWishId: 9, metrics: { perUseCents: 123 } };
  const writableItem = parseItem(item({ purchasePriceCents: 0 }), today);
  const writableWish = parseWish({ name: "合成愿望", budgetCents: null });
  const writableUse = parseUse({ itemId: 42, usedOn: today, count: 2 }, today);
  for (const [build, writable, parse] of [[itemPayload, writableItem, v => parseItem(v, today)], [wishPayload, writableWish, parseWish], [usePayload, writableUse, v => parseUse(v, today)]]) {
    const readModel = { ...writable, ...metadata };
    assert.equal(parse(readModel), null, "old spread payload is rejected by the unchanged server whitelist");
    const payload = build(readModel);
    assert.deepEqual(payload, writable);
    assert.deepEqual(parse(payload), writable);
    assert.equal(readModel.id, 17, "projection never mutates server data");
    for (const key of Object.keys(metadata)) assert.equal(Object.hasOwn(payload, key), false);
  }
  assert.equal(usePayload({ ...writableUse, ...metadata }).itemId, 42, "validated parent relation remains explicit");
});

test("possessions: missing dates and prices can be saved without manufacturing zero", () => {
  const parsed = parseItem({ name: " 合成物品 ", category: "其他" }, today);
  assert.equal(parsed.purchaseDate, null); assert.equal(parsed.purchasePriceCents, null); assert.equal(parsed.name, "合成物品");
  assert.equal(itemMetrics(parsed, 0, today).holdingDays, null); assert.equal(itemMetrics(parsed, 3, today).perUseCents, null);
});
test("possessions: explicit zero is a real price, even with no purchase date", () => {
  const parsed = parseItem(item({ purchasePriceCents: 0, purchaseDate: null }), today);
  assert.equal(parsed.purchasePriceCents, 0);
  assert.equal(itemMetrics(parsed, 3, today).perUseCents, 0); assert.equal(itemMetrics(parsed, 3, today).perDayCents, null);
  assert.equal(formatCost(0), "¥0.00"); assert.equal(formatCost(null), "不可计算");
});
test("possessions: zero uses is not a valid denominator; multiple records supply the count", () => {
  const uses = [{ usedOn: "2026-10-01", count: 1 }, { usedOn: "2026-10-02", count: 3 }, { usedOn: "2026-11-01", count: 99 }];
  assert.equal(recordedUsesThrough(uses, today), 4); assert.equal(itemMetrics(item(), 0, today).perUseCents, null);
  assert.equal(itemMetrics(item(), 4, today).perUseCents, 2500); assert.equal(itemMetrics(item(), 4, today).holdingDays, 26);
});
test("possessions: the purchase day counts as one and UTC arithmetic handles leap years", () => {
  assert.equal(itemMetrics(item(), 1, "2026-10-01").holdingDays, 1);
  assert.equal(itemMetrics(item({ purchaseDate: "2024-02-28" }), 1, "2024-03-01").holdingDays, 3);
  assert.equal(itemMetrics(item({ purchaseDate: "2026-01-01" }), 1, "2025-12-31").holdingDays, null);
});
for (const status of ["sold", "gifted", "retired"]) test(`possessions: ${status} stops holding days on the actual exit date`, () => {
  const metrics = itemMetrics(item({ status, endedDate: "2026-10-10" }), 4, today);
  assert.equal(metrics.holdingDays, 10); assert.equal(metrics.perDayCents, 1000); assert.equal(metrics.throughDate, "2026-10-10");
  assert.equal(itemMetrics(item({ status, endedDate: "2026-10-10" }), 4, "2026-10-05").holdingDays, 5);
  assert.equal(itemMetrics(item({ status, endedDate: null }), 4, today).holdingDays, null);
});
test("possessions: no guessing for invalid, future or contradictory dates", () => {
  for (const purchaseDate of ["2026-02-30", "2026-02-29", "2026-13-01", "26-1-1", "2026-10-27"]) assert.equal(parseItem(item({ purchaseDate }), today), null);
  assert.ok(parseItem(item({ purchaseDate: "2024-02-29" }), today));
  for (const patch of [{ status: "sold" }, { status: "sold", endedDate: "2026-09-30" }, { status: "sold", endedDate: "2026-10-27" }, { status: "in_use", endedDate: "2026-10-05" }]) assert.equal(parseItem(item(patch), today), null);
});
test("possessions: only nonnegative integer cents and whitelisted fields enter persistence", () => {
  for (const purchasePriceCents of [-1, 1.5, Infinity, NaN, "100", Number.MAX_SAFE_INTEGER + 1]) assert.equal(parseItem(item({ purchasePriceCents }), today), null);
  for (const value of [null, [], {}, item({ sourceWishId: 1 }), item({ archivedAt: today }), item({ name: " " }), item({ status: "score" })]) assert.equal(parseItem(value, today), null);
});
test("possessions: exact yuan conversion keeps blanks, zero and cents distinct", () => {
  assert.equal(yuanToCents(""), null); assert.equal(yuanToCents("0"), 0); assert.equal(yuanToCents("0.29"), 29); assert.equal(yuanToCents("123.45"), 12345);
  for (const value of ["-1", "1e3", "0.001", "NaN", "90071992547409.92"]) assert.throws(() => yuanToCents(value));
});
test("possessions: usage defaults to one and accepts historical dates without inferred gaps", () => {
  assert.deepEqual(parseUse({ itemId: 1, usedOn: "2024-02-29" }, today), { itemId: 1, usedOn: "2024-02-29", count: 1, note: "" });
  for (const patch of [{ itemId: 0 }, { itemId: "1" }, { usedOn: "2026-02-30" }, { usedOn: "2026-10-27" }, { count: 0 }, { count: -1 }, { count: 1.5 }, { count: 1000001 }]) assert.equal(parseUse({ itemId: 1, usedOn: today, ...patch }, today), null);
});
test("possessions: wish budgets remain independent, optional dates may be in the future", () => {
  assert.equal(parseWish({ name: "合成愿望" }).budgetCents, null);
  assert.ok(parseWish({ name: "合成愿望", budgetCents: 0, plannedDate: "2028-02-29" }));
  for (const patch of [{ budgetCents: -1 }, { budgetCents: 1.1 }, { plannedDate: "2027-02-29" }, { status: "unknown" }, { itemId: 1 }]) assert.equal(parseWish({ name: "合成愿望", ...patch }), null);
});
test("possessions: Shanghai natural date changes at 16:00 UTC", () => {
  assert.equal(shanghaiToday(new Date("2026-10-25T15:59:59Z")), "2026-10-25");
  assert.equal(shanghaiToday(new Date("2026-10-25T16:00:00Z")), today);
});
test("possessions: snapshot adds only three tables and leaves all nine existing structures untouched", () => {
  const old = JSON.parse(readFileSync(new URL("../drizzle/meta/0015_snapshot.json", import.meta.url)));
  const next = JSON.parse(readFileSync(new URL("../drizzle/meta/0016_snapshot.json", import.meta.url)));
  assert.equal(next.prevId, old.id);
  for (const [key, table] of Object.entries(old.tables)) assert.deepEqual(next.tables[key], table);
  assert.deepEqual(Object.keys(next.tables).filter(key => !(key in old.tables)).sort(), ["possession_items", "possession_uses", "possession_wishes"]);
  const migration = readFileSync(new URL("../drizzle/0016_possessions_phase1.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /\b(?:DROP|ALTER|DELETE|UPDATE|INSERT)\s+(?:TABLE|FROM|INTO|health_|calendar_|salary_|finance_)/i);
});
