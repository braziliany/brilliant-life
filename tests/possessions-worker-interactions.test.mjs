import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, after, test } from "node:test";
import { possessionsWorker } from "./helpers/possessions-worker.mjs";
import { ITEM_KEYS, WISH_KEYS } from "../app/features/possessions/validation.ts";
import { itemPayload, wishPayload, usePayload } from "../app/features/possessions/payload.ts";

let worker;
const evidence = [];
before(async () => { worker = await possessionsWorker(); });
after(async () => { if (worker) { writeFileSync(join(worker.directory, "results.json"), JSON.stringify(evidence, null, 2)); await worker.close(); } });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const form = (page, name) => page.getByRole("form", { name, exact: true });
const detail = page => page.getByRole("article", { name: "物品详情" });
const keys = (payload, expected) => assert.deepEqual(Object.keys(payload).sort(), [...expected].sort());
async function get(page, path = "/api/possessions") {
  const response = await page.request.get(`${worker.origin}${path}`); assert.equal(response.status(), 200); return response.json();
}
async function save(page, name, { status = 200, twice = false } = {}) {
  const response = page.waitForResponse(r => r.url().includes("/api/possessions/") && r.request().method() !== "GET");
  if (twice) await form(page, name).evaluate(el => { el.requestSubmit(); el.requestSubmit(); });
  else await form(page, name).getByRole("button", { name: "保存", exact: true }).click();
  const saved = await response; assert.equal(saved.status(), status, await saved.text());
  if (status < 300) await form(page, name).waitFor({ state: "detached" });
  else await form(page, name).getByRole("alert").waitFor();
  return saved.json();
}
async function openItem(page, name) {
  await page.getByRole("button", { name: new RegExp(name) }).click(); await detail(page).waitFor();
}
async function withPage(label, action, width = 1440) {
  const context = await worker.browser.newContext({ viewport: { width, height: 1100 }, reducedMotion: "reduce" });
  const page = await context.newPage(), errors = [], writes = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().startsWith(worker.origin + "/api/possessions/") && request.method() !== "GET") writes.push({ method: request.method(), path: new URL(request.url()).pathname, payload: request.postDataJSON() }); });
  try {
    await page.goto(`${worker.origin}/possessions`); await button(page, "新增物品").waitFor();
    await action(page, writes);
    await page.getByText("正在读取物品档案…", { exact: true }).waitFor({ state: "detached" });
    await page.getByText("正在读取物品详情…", { exact: true }).waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    evidence.push({ label, width, writes, result: "PASS" });
  } finally { await context.close(); }
}

test("Worker browser + D1: create/reload/edit every item field, reject a failed draft, preserve metadata and zero", async () => withPage("item-create-edit", async (page, writes) => {
  await button(page, "新增物品").click(); await form(page, "新增物品").getByLabel("名称", { exact: true }).fill("合成·真实保存雨伞");
  const created = (await save(page, "新增物品", { status: 201, twice: true })).record;
  keys(writes[0].payload, ITEM_KEYS); assert.equal(writes.length, 1, "rapid double submit sends one creation");
  assert.equal(created.purchasePriceCents, null); assert.equal(created.purchaseDate, null);
  await page.reload(); await openItem(page, "合成·真实保存雨伞");
  assert.ok((await detail(page).innerText()).includes("未知"));
  await button(page, "编辑物品").click();
  const editing = form(page, "编辑物品");
  await editing.getByLabel("名称", { exact: true }).fill("合成·修正后的雨伞");
  await editing.getByLabel("分类", { exact: true }).fill("随身用品");
  await editing.getByLabel("品牌／型号").fill("合成品牌 A2");
  await editing.getByLabel("购买日期（可选）", { exact: true }).fill("2024-02-29");
  await editing.getByLabel("实际购买价格（元，可选）").fill("120.50");
  await editing.getByLabel("备注", { exact: true }).fill("真实 HTTP 保存的合成备注");
  await editing.getByLabel("当前状态").selectOption("idle");
  await save(page, "编辑物品"); keys(writes.at(-1).payload, [...ITEM_KEYS, "id"]);
  await page.reload(); await openItem(page, "合成·修正后的雨伞");
  const updated = (await get(page, `/api/possessions?itemId=${created.id}`)).item;
  for (const [key, value] of Object.entries({ name: "合成·修正后的雨伞", category: "随身用品", brandModel: "合成品牌 A2", purchaseDate: "2024-02-29", purchasePriceCents: 12050, notes: "真实 HTTP 保存的合成备注", status: "idle" })) assert.equal(updated[key], value);
  assert.equal(updated.createdAt, created.createdAt); assert.equal(updated.sourceWishId, null); assert.equal(updated.archivedAt, null);
  await button(page, "编辑物品").click();
  await form(page, "编辑物品").getByLabel("购买日期（可选）", { exact: true }).evaluate(el => el.removeAttribute("max"));
  await form(page, "编辑物品").getByLabel("购买日期（可选）", { exact: true }).fill("2099-01-01");
  await save(page, "编辑物品", { status: 400 });
  assert.equal(await form(page, "编辑物品").getByLabel("名称", { exact: true }).inputValue(), updated.name);
  assert.equal(await page.getByRole("status").count(), 0, "failed request cannot announce success");
  assert.equal((await get(page, `/api/possessions?itemId=${created.id}`)).item.purchaseDate, "2024-02-29");
  await form(page, "编辑物品").getByLabel("购买日期（可选）", { exact: true }).fill("2024-02-29");
  await form(page, "编辑物品").getByLabel("实际购买价格（元，可选）").fill("0"); await save(page, "编辑物品");
  await page.reload(); await openItem(page, updated.name); assert.ok((await detail(page).innerText()).includes("¥0.00"));
  const rows = worker.query(`SELECT * FROM possession_items WHERE id=${created.id}`);
  assert.equal(rows.length, 1); assert.equal(rows[0].purchase_price_cents, 0); assert.equal(rows[0].created_at, created.createdAt);
}));

test("Worker browser + D1: use create/backfill/edit/delete, confirmation, costs and archive survive refresh", async () => withPage("uses-archive", async (page, writes) => {
  await button(page, "新增物品").click(); await form(page, "新增物品").getByLabel("名称", { exact: true }).fill("合成·使用链路");
  await form(page, "新增物品").getByLabel("实际购买价格（元，可选）").fill("100");
  const item = (await save(page, "新增物品", { status: 201 })).record; await openItem(page, item.name);
  await button(page, "记录使用").click(); assert.equal(await form(page, "使用记录").getByLabel("使用次数").inputValue(), "1");
  await form(page, "使用记录").getByLabel("使用日期").fill("2024-02-29");
  const use = (await save(page, "使用记录", { status: 201, twice: true })).record;
  keys(writes.at(-1).payload, ["itemId", "usedOn", "count", "note"]);
  await button(page, "编辑使用记录 2024-02-29").click();
  await form(page, "使用记录").getByLabel("使用次数").fill("4");
  await form(page, "使用记录").getByLabel("使用备注").fill("合成·补录更正");
  await form(page, "使用记录").getByLabel("使用日期").evaluate(el => el.removeAttribute("max"));
  await form(page, "使用记录").getByLabel("使用日期").fill("2099-01-01"); await save(page, "使用记录", { status: 400 });
  assert.equal(await form(page, "使用记录").getByLabel("使用次数").inputValue(), "4");
  assert.equal(await form(page, "使用记录").getByLabel("使用备注").inputValue(), "合成·补录更正");
  assert.equal((await get(page, `/api/possessions?itemId=${item.id}`)).uses[0].count, 1);
  await form(page, "使用记录").getByLabel("使用日期").fill("2024-02-29"); await save(page, "使用记录");
  keys(writes.at(-1).payload, ["id", "itemId", "usedOn", "count", "note"]);
  await page.reload(); await openItem(page, item.name);
  let read = await get(page, `/api/possessions?itemId=${item.id}`); assert.equal(read.item.metrics.recordedUses, 4); assert.equal(read.item.metrics.perUseCents, 2500);
  assert.equal(read.uses[0].createdAt, use.createdAt); assert.equal(read.uses[0].note, "合成·补录更正");
  await button(page, "记录使用").click(); await form(page, "使用记录").getByLabel("使用日期").fill("2025-01-01"); await save(page, "使用记录", { status: 201 });
  const beforeCancel = writes.length;
  page.once("dialog", dialog => dialog.dismiss()); await button(page, "删除使用记录 2024-02-29").click(); assert.equal(writes.length, beforeCancel);
  page.once("dialog", dialog => dialog.accept()); await button(page, "删除使用记录 2024-02-29").click(); await button(page, "删除使用记录 2024-02-29").waitFor({ state: "detached" });
  read = await get(page, `/api/possessions?itemId=${item.id}`); assert.equal(read.item.metrics.recordedUses, 1); assert.equal(read.item.metrics.perUseCents, 10000);
  await button(page, "编辑物品").click(); await form(page, "编辑物品").getByLabel("当前状态").selectOption("sold");
  await form(page, "编辑物品").getByLabel("停止持有日期").fill("2026-01-01"); await save(page, "编辑物品");
  await button(page, "归档物品").click(); await button(page, "取消归档").waitFor();
  await page.reload(); await button(page, "已归档").click(); await openItem(page, item.name);
  read = await get(page, `/api/possessions?itemId=${item.id}`); assert.equal(read.item.status, "sold"); assert.equal(read.item.endedDate, "2026-01-01"); assert.equal(read.uses.length, 1); assert.ok(read.item.archivedAt);
  assert.equal(worker.query(`SELECT count(*) AS n FROM possession_uses WHERE item_id=${item.id}`)[0].n, 1);
}));

test("Worker browser + D1: wish create/edit/status/convert retains source, rejects conflict and preserves draft", async () => withPage("wish-conversion", async (page, writes) => {
  await button(page, "愿望清单").click(); await button(page, "新增愿望").click();
  await form(page, "新增愿望").getByLabel("愿望名称").fill("合成·真实愿望");
  const wish = (await save(page, "新增愿望", { status: 201, twice: true })).record; keys(writes.at(-1).payload, WISH_KEYS);
  await button(page, `编辑愿望 ${wish.name}`).click();
  await form(page, "编辑愿望").getByLabel("愿望名称").fill("合成·已购买相机");
  await form(page, "编辑愿望").getByLabel("预期价格或预算（元，可选）").fill("2000");
  await form(page, "编辑愿望").getByLabel("计划购买日期（可选）").fill("2028-02-29");
  await form(page, "编辑愿望").getByLabel("愿望备注").fill("计划不是成交事实");
  await form(page, "编辑愿望").getByLabel("愿望状态").selectOption("purchased"); await save(page, "编辑愿望");
  keys(writes.at(-1).payload, [...WISH_KEYS, "id"]);
  await page.reload(); await button(page, "愿望清单").click();
  await button(page, "转入档案").click();
  assert.equal(await form(page, "转入物品档案").getByLabel("实际购买价格（元，可选）").inputValue(), "");
  assert.equal(await form(page, "转入物品档案").getByLabel("购买日期（可选）", { exact: true }).inputValue(), "");
  const converted = (await save(page, "转入物品档案", { status: 201, twice: true })).item;
  await detail(page).waitFor(); keys(writes.at(-1).payload.item, ITEM_KEYS);
  await page.reload(); await openItem(page, converted.name);
  const read = await get(page, `/api/possessions?itemId=${converted.id}`);
  assert.equal(read.item.sourceWishId, wish.id); assert.equal(read.item.purchasePriceCents, null); assert.equal(read.item.purchaseDate, null);
  await button(page, "愿望清单").click(); await button(page, `编辑愿望 ${converted.name}`).click();
  await form(page, "编辑愿望").getByLabel("愿望状态").selectOption("cancelled");
  await form(page, "编辑愿望").getByLabel("愿望备注").fill("失败后仍可恢复的草稿"); await save(page, "编辑愿望", { status: 409 });
  assert.equal(await form(page, "编辑愿望").getByLabel("愿望备注").inputValue(), "失败后仍可恢复的草稿");
  assert.equal(await page.getByRole("status").count(), 0);
  await form(page, "编辑愿望").getByLabel("愿望状态").selectOption("purchased"); await save(page, "编辑愿望");
  const source = worker.query(`SELECT * FROM possession_wishes WHERE id=${wish.id}`)[0];
  assert.equal(source.created_at, wish.createdAt); assert.equal(source.budget_cents, 200000); assert.equal(source.notes, "失败后仍可恢复的草稿");
  assert.equal(worker.query(`SELECT count(*) AS n FROM possession_items WHERE source_wish_id=${wish.id}`)[0].n, 1);
}));

test("Worker HTTP + D1: invalid/readonly fields, IDs and foreign origin cannot write", async () => {
  const context = await worker.browser.newContext();
  try {
  const overview = async () => (await context.request.get(`${worker.origin}/api/possessions`)).json();
  const prior = await overview();
  const request = async (resource, payload, status = 400, method = "POST", extra = {}) => {
    const response = await context.request.fetch(`${worker.origin}/api/possessions/${resource}`, { method, headers: { Origin: worker.origin, "Content-Type": "application/json", ...extra }, data: payload });
    assert.equal(response.status(), status, await response.text());
  };
  for (const patch of [{ purchaseDate: "2026-02-30" }, { purchaseDate: "2026-13-01" }, { purchasePriceCents: -1 }, { purchasePriceCents: 1.1 }, { status: "invalid" }, { createdAt: "2000-01-01" }, { metrics: {} }, { sourceWishId: 1 }]) await request("items", { name: "合成·无效", category: "其他", ...patch });
  for (const resource of ["items", "wishes", "uses"]) await request(resource, { id: "1" }, 400, "PUT");
  const knownItem = prior.items[0], knownWish = prior.wishes[0];
  const knownUse = (await (await context.request.get(`${worker.origin}/api/possessions?itemId=${prior.items.find(item => item.name === "合成·使用链路").id}`)).json()).uses[0];
  await request("items", { id: knownItem.id, ...itemPayload(knownItem), archivedAt: "2000-01-01", metrics: {} }, 400, "PUT");
  await request("wishes", { id: knownWish.id, ...wishPayload(knownWish), createdAt: "2000-01-01" }, 400, "PUT");
  await request("uses", { id: knownUse.id, ...usePayload(knownUse), updatedAt: "2000-01-01" }, 400, "PUT");
  await request("uses", { itemId: 99999999, usedOn: "2024-02-29" }, 404);
  await request("uses", { itemId: -1, usedOn: "2024-02-29" });
  // Wrangler 4.114's proxy can crash when an early denial leaves an uploaded
  // body unread. Probe its origin guard without an upload; handler-level tests
  // separately retain the JSON-body rejection and verify zero D1 access.
  const forbidden = await context.request.post(`${worker.origin}/api/possessions/items`, { headers: { Origin: "https://other.example.com" } });
  assert.equal(forbidden.status(), 403); await forbidden.body();
  const unauthorized = await context.request.get(`${worker.origin}/api/possessions`, { headers: { Host: "unauthorized.example.com" } });
  assert.equal(unauthorized.status(), 401); await unauthorized.body();
  const converted = prior.items.find(item => item.sourceWishId !== null);
  await request("convert", { wishId: converted.sourceWishId, item: { name: "合成·重复转换", category: "其他" } }, 409);
  assert.deepEqual(await overview(), prior, "all rejected requests leave facts unchanged");
  evidence.push({ label: "http-validation-security", result: "PASS", authentication: "401 checked separately at handler boundary in possessions-api.test.mjs; local host is deliberately authorized by existing policy; production Access not tested" });
  } finally { await context.close(); }
});

async function fits(page) {
  const violations = await page.locator('section[aria-labelledby="possessions-title"]').evaluate(section => {
    const box = section.getBoundingClientRect();
    return [...section.querySelectorAll("*")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1 || (!el.matches("input,textarea") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)); }).map(el => `${el.tagName}.${el.className}`);
  });
  assert.deepEqual(violations, []); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
for (const width of [320, 375, 390, 430, 768, 1024, 1440]) test(`Worker browser visual: ${width}px long editor, real 400, recoverable draft, detail and return`, async () => withPage(`visual-save-${width}`, async page => {
  const name = `合成·${width}像素的长名称` + "陪伴日常的物品".repeat(8);
  await button(page, "新增物品").click(); await form(page, "新增物品").getByLabel("名称", { exact: true }).fill(name);
  await form(page, "新增物品").getByLabel("备注", { exact: true }).fill("合成·长备注用于保存失败和恢复的布局检查。".repeat(50));
  await form(page, "新增物品").getByLabel("购买日期（可选）", { exact: true }).evaluate(el => el.removeAttribute("max"));
  await form(page, "新增物品").getByLabel("购买日期（可选）", { exact: true }).fill("2099-01-01");
  await fits(page); await save(page, "新增物品", { status: 400 });
  assert.equal(await form(page, "新增物品").getByLabel("名称", { exact: true }).inputValue(), name); await fits(page);
  await page.screenshot({ path: join(worker.directory, `error-${width}.png`), fullPage: true });
  await form(page, "新增物品").getByLabel("购买日期（可选）", { exact: true }).fill(""); await save(page, "新增物品", { status: 201 });
  await openItem(page, name); await fits(page); await detail(page).getByText("完整备注", { exact: true }).click(); await fits(page);
  await page.screenshot({ path: join(worker.directory, `detail-${width}.png`), fullPage: true });
  await button(page, "编辑物品").click(); await fits(page); await form(page, "编辑物品").getByRole("button", { name: "取消", exact: true }).click();
  await detail(page).waitFor(); await button(page, "← 返回列表").click(); await fits(page);
}, width));
