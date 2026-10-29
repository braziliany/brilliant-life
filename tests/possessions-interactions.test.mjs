import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { browserHarness } from "./helpers/browser-harness.mjs";
import { itemMetrics, recordedUsesThrough } from "../app/features/possessions/domain.ts";
const withPage = browserHarness("tests/fixtures/possessions.tsx", "possessions");
const today = "2026-10-26";
const baseItem = { id: 1, name: "合成耳机", category: "数码", brandModel: "合成型号", purchaseDate: "2026-10-01", purchasePriceCents: 10000, notes: "合成档案", status: "in_use", endedDate: null, archivedAt: null, sourceWishId: null, createdAt: today, updatedAt: today };
async function transport(page, { seeded = false, long = false } = {}) {
  const state = { items: seeded ? [{ ...baseItem, name: long ? "很长的合成物品名称用于检查换行与移动端容器约束".repeat(3) : baseItem.name }] : [], wishes: [], uses: [], writes: [], failSave: false, failRead: false };
  let nextId = 10;
  const view = item => ({ ...item, metrics: itemMetrics(item, recordedUsesThrough(state.uses.filter(use => use.itemId === item.id), today), today) });
  await page.route("**/api/possessions**", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (method === "GET") {
      if (state.failRead) return route.fulfill({ status: 500, json: { error: "合成读取失败" } });
      const id = Number(url.searchParams.get("itemId"));
      return route.fulfill({ json: id ? { asOf: today, item: view(state.items.find(item => item.id === id)), uses: state.uses.filter(use => use.itemId === id) } : { asOf: today, items: state.items.map(view), wishes: state.wishes } });
    }
    const body = request.postDataJSON(); state.writes.push({ resource: url.pathname.split("/").at(-1), method, body });
    if (state.failSave) return route.fulfill({ status: 500, json: { error: "合成保存失败" } });
    const now = { createdAt: today, updatedAt: today };
    const resource = url.pathname.split("/").at(-1);
    let record;
    if (resource === "convert") { record = { ...body.item, ...now, id: nextId++, sourceWishId: body.wishId, archivedAt: null }; state.items.push(record); return route.fulfill({ status: 201, json: { item: record } }); }
    const collection = resource === "items" ? state.items : resource === "wishes" ? state.wishes : state.uses;
    if (method === "DELETE") { collection.splice(collection.findIndex(row => row.id === body.id), 1); return route.fulfill({ json: { deleted: body.id } }); }
    if (method === "PATCH") { record = collection.find(row => row.id === body.id); record.archivedAt = body.archived ? today : null; }
    else if (method === "PUT") { record = collection.find(row => row.id === body.id); Object.assign(record, body, { updatedAt: today }); }
    else { record = { ...body, ...now, id: nextId++, ...(resource === "items" ? { archivedAt: null, sourceWishId: null } : {}) }; collection.push(record); }
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: { record } });
  });
  return state;
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const form = (page, name) => page.getByRole("form", { name, exact: true });
const save = async (page, name) => { await form(page, name).getByRole("button", { name: "保存", exact: true }).click(); await form(page, name).waitFor({ state: "detached" }); };

test("possessions browser: create with unknown purchase facts, edit explicit zero and preserve a failed draft", async () => withPage("page", async (page, open) => {
  const state = await transport(page); await open(); await button(page, "新增物品").click();
  await form(page, "新增物品").getByLabel("名称", { exact: true }).fill("合成雨伞"); state.failSave = true;
  await form(page, "新增物品").getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "合成保存失败" }).waitFor();
  assert.equal(await form(page, "新增物品").getByLabel("名称", { exact: true }).inputValue(), "合成雨伞");
  state.failSave = false; await save(page, "新增物品");
  assert.equal(state.items[0].purchaseDate, null); assert.equal(state.items[0].purchasePriceCents, null);
  await page.getByRole("button", { name: /合成雨伞/ }).click();
  await page.getByRole("article", { name: "物品详情" }).waitFor();
  await button(page, "编辑物品").click(); await form(page, "编辑物品").getByLabel("实际购买价格（元，可选）").fill("0"); await save(page, "编辑物品");
  assert.equal(state.items[0].purchasePriceCents, 0); await page.getByText("¥0.00", { exact: true }).waitFor();
}));
test("possessions browser: actual usage defaults to one; edit, backfill and delete recompute totals after reload", async () => withPage("page", async (page, open) => {
  const state = await transport(page, { seeded: true }); await open(); await page.getByRole("button", { name: /合成耳机/ }).click(); await button(page, "记录使用").click();
  assert.equal(await form(page, "使用记录").getByLabel("使用次数").inputValue(), "1");
  await form(page, "使用记录").getByLabel("使用日期").fill("2026-10-10"); await save(page, "使用记录");
  await button(page, "编辑使用记录 2026-10-10").click(); await form(page, "使用记录").getByLabel("使用次数").fill("3"); await save(page, "使用记录");
  await button(page, "记录使用").click(); await form(page, "使用记录").getByLabel("使用日期").fill("2024-02-29"); await form(page, "使用记录").getByLabel("使用次数").fill("2"); await save(page, "使用记录");
  assert.equal(state.uses.reduce((sum, use) => sum + use.count, 0), 5);
  page.once("dialog", dialog => dialog.accept()); await button(page, "删除使用记录 2026-10-10").click();
  await button(page, "删除使用记录 2026-10-10").waitFor({ state: "detached" });
  await page.reload(); await page.getByRole("button", { name: /合成耳机/ }).click();
  await page.getByText("¥50.00", { exact: true }).waitFor(); assert.equal(state.uses.length, 1); assert.equal(state.uses[0].count, 2);
}));
test("possessions browser: purchased wish converts explicitly with blank actual price and purchase date", async () => withPage("page", async (page, open) => {
  const state = await transport(page); await open(); await button(page, "愿望清单").click(); await button(page, "新增愿望").click();
  await form(page, "新增愿望").getByLabel("愿望名称").fill("合成相机"); await form(page, "新增愿望").getByLabel("预期价格或预算（元，可选）").fill("1000");
  await form(page, "新增愿望").getByLabel("愿望状态").selectOption("purchased"); await save(page, "新增愿望");
  await button(page, "转入档案").click(); assert.equal(await form(page, "转入物品档案").getByLabel("实际购买价格（元，可选）").inputValue(), "");
  assert.equal(await form(page, "转入物品档案").getByLabel("购买日期（可选）", { exact: true }).inputValue(), "");
  await save(page, "转入物品档案"); await page.getByRole("article", { name: "物品详情" }).waitFor();
  assert.equal(state.items[0].purchasePriceCents, null); assert.equal(state.items[0].sourceWishId, state.wishes[0].id);
  assert.equal(state.writes.filter(write => write.resource === "convert").length, 1);
}));
test("possessions browser: terminal state needs a true exit date; archive preserves usages and ownership facts", async () => withPage("page", async (page, open) => {
  const state = await transport(page, { seeded: true }); await open(); await page.getByRole("button", { name: /合成耳机/ }).click(); await button(page, "编辑物品").click();
  await form(page, "编辑物品").getByLabel("当前状态").selectOption("sold");
  assert.equal(await form(page, "编辑物品").getByLabel("停止持有日期").getAttribute("required"), "");
  await form(page, "编辑物品").getByLabel("停止持有日期").fill("2026-10-10"); await save(page, "编辑物品");
  await page.getByText("10 天", { exact: true }).waitFor(); await button(page, "归档物品").click();
  await button(page, "取消归档").waitFor(); await button(page, "取消归档").click(); await button(page, "归档物品").waitFor();
  assert.equal(state.items[0].archivedAt, null); assert.equal(state.items[0].endedDate, "2026-10-10");
}));
test("possessions browser: failed initial read is explicit and retry recovers, failed refresh keeps verified cache", async () => withPage("page", async (page, open) => {
  const state = await transport(page, { seeded: true }); state.failRead = true; await open(); await page.getByRole("alert").waitFor();
  assert.equal(await button(page, "新增物品").count(), 0); state.failRead = false; await button(page, "重新读取").click(); await page.getByRole("button", { name: /合成耳机/ }).waitFor();
  await button(page, "新增物品").click(); await form(page, "新增物品").getByLabel("名称", { exact: true }).fill("合成新物品"); state.failRead = true; await save(page, "新增物品");
  await page.getByRole("alert").filter({ hasText: "可能未更新" }).waitFor(); assert.equal(await page.getByRole("button", { name: /合成耳机/ }).count(), 1);
  state.failRead = false; await button(page, "重新读取").click(); await page.getByRole("button", { name: /合成新物品/ }).waitFor();
}));
for (const width of [320, 375, 390, 430]) test(`possessions browser: ${width}px real page, forms and detail remain inside the mobile container`, async () => withPage("page", async (page, open) => {
  await transport(page, { seeded: true, long: true }); await open();
  const assertFits = async label => {
    const failures = await page.locator("section[aria-labelledby=possessions-title]").evaluate(section => {
      const box = section.getBoundingClientRect();
      return [...section.querySelectorAll("*")].filter(el => {
        // Long text legitimately scrolls inside native editors. Every element,
        // including those editors, must still stay within the actual card bounds.
        const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1 || (!el.matches("input,textarea") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1));
      }).map(el => `${el.tagName}.${el.className}`);
    });
    assert.deepEqual(failures, [], label);
    for (const input of await page.locator("input,select,textarea").all()) assert.ok(Number.parseFloat(await input.evaluate(el => getComputedStyle(el).fontSize)) >= 16);
  };
  await page.getByRole("button", { name: /很长的合成物品名称/ }).waitFor(); await assertFits("list");
  await page.getByRole("button", { name: /很长的合成物品名称/ }).click(); await button(page, "编辑物品").waitFor(); await assertFits("detail");
  await button(page, "编辑物品").click(); await form(page, "编辑物品").getByLabel("当前状态").selectOption("gifted"); await assertFits("item form with exit date");
  const directory = join(fileURLToPath(new URL("..", import.meta.url)), ".wrangler", "possessions-phase1", "mobile"); mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `item-form-${width}.png`), fullPage: true });
  await form(page, "编辑物品").getByRole("button", { name: "取消", exact: true }).click(); await button(page, "记录使用").click(); await assertFits("usage form");
  await form(page, "使用记录").getByRole("button", { name: "取消", exact: true }).click(); await button(page, "愿望清单").click(); await button(page, "新增愿望").click(); await assertFits("wish form");
}, { viewport: { width, height: 1100 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }));

const visualDirectory = join(fileURLToPath(new URL("..", import.meta.url)), ".wrangler", "possessions-phase11", "visual");
async function assertSectionFits(page, selector) {
  const violations = await page.locator(selector).evaluate(section => {
    const box = section.getBoundingClientRect();
    return [...section.querySelectorAll("*")].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && (rect.left < box.left - 1 || rect.right > box.right + 1 || (!el.matches("input,textarea") && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1));
    }).map(el => `${el.tagName}.${el.className}`);
  });
  assert.deepEqual(violations, [], "all rendered children stay inside their own container");
}
for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`possessions visual: ${width}px homepage has a complete secondary entry outside the Hero actions`, async () => withPage("home", async (page, open) => {
    await open(); const entry = page.getByRole("link", { name: "进入物品档案", exact: true });
    assert.equal(await entry.getAttribute("href"), "/possessions");
    assert.equal(await entry.locator('[aria-hidden="true"]').textContent(), "→", "navigation uses a plain text arrow instead of an emoji-capable diagonal arrow");
    assert.equal(await page.locator(".homeHeroActions a").count(), 0);
    assert.equal(await page.locator(".homeHeroActions button").count(), 2);
    const bounds = await entry.boundingBox(), hero = await page.locator(".homeHero").boundingBox(), highlights = await page.locator(".homeHighlights").boundingBox();
    assert.ok(bounds.y >= hero.y + hero.height && bounds.y + bounds.height <= highlights.y);
    assert.ok(bounds.height >= 80, "entry has its own usable visual container");
    await assertSectionFits(page, '.homePage');
    const normal = await entry.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth }));
    assert.ok(parseFloat(normal.border) > 0);
    await entry.hover(); const hover = await entry.evaluate(el => getComputedStyle(el).backgroundColor); assert.notEqual(hover, normal.background);
    await entry.focus(); assert.equal(await entry.evaluate(el => el === document.activeElement), true);
    assert.ok(parseFloat(await entry.evaluate(el => getComputedStyle(el).outlineWidth)) >= 2);
    mkdirSync(visualDirectory, { recursive: true }); await page.screenshot({ path: join(visualDirectory, `home-${width}.png`), fullPage: true });
  }, { viewport: { width, height: 1100 }, reducedMotion: "reduce" }));
  test(`possessions visual: ${width}px detail preserves all five states and adapts its horizontal composition`, async () => withPage("page", async (page, open) => {
    const state = await transport(page, { seeded: true });
    const cases = [
      { status: "in_use", label: "使用中", name: "合成·陪伴日常的长名称物品".repeat(5), brandModel: "合成型号", purchasePriceCents: 19900, endedDate: null },
      { status: "idle", label: "闲置", name: "合成·未知信息", brandModel: null, purchasePriceCents: null, purchaseDate: null, endedDate: null },
      ...[["sold", "已出售"], ["gifted", "已转赠"], ["retired", "已淘汰"]].map(([status, label]) => ({ status, label, name: `合成·${label}的物品`, brandModel: null, purchasePriceCents: 0, endedDate: "2026-10-10" })),
    ];
    for (const scenario of cases) {
      state.items[0] = { ...baseItem, ...scenario, notes: "这是用来检查长描述换行和信息层级的合成备注。".repeat(12) };
      await open(); await page.getByRole("button", { name: new RegExp(scenario.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      assert.equal(await page.getByRole("link", { name: "返回首页 →", exact: true }).count(), 1);
      const detail = page.getByRole("article", { name: "物品详情" }); await detail.waitFor();
      await detail.getByRole("heading", { name: scenario.name, exact: true }).waitFor();
      assert.ok((await detail.getByRole("region", { name: "物品主信息" }).innerText()).includes(scenario.label));
      const stats = detail.locator('dl[aria-label="物品关键数据"]'); assert.equal(await stats.locator(":scope > div").count(), 4);
      assert.ok((await stats.innerText()).includes("0 次"), "missing records never invent positive use");
      if (scenario.status === "idle") { assert.ok((await stats.innerText()).includes("未知")); assert.ok((await stats.innerText()).includes("不可计算")); }
      const heroLayout = await detail.getByRole("region", { name: "物品主信息" }).evaluate(hero => {
        const [identity, metrics] = [...hero.children].map(el => el.getBoundingClientRect());
        return { horizontal: metrics.left >= identity.right, below: metrics.top >= identity.bottom, columns: getComputedStyle(hero).gridTemplateColumns };
      });
      assert.equal(width >= 768 ? heroLayout.horizontal : heroLayout.below, true, heroLayout.columns);
      assert.equal(await detail.getByRole("group", { name: "物品操作" }).getByRole("button").count(), 3);
      await assertSectionFits(page, 'section[aria-labelledby="possessions-title"]');
      await detail.getByText("完整备注", { exact: true }).click(); await assertSectionFits(page, 'section[aria-labelledby="possessions-title"]');
      if (scenario.status === "in_use") { mkdirSync(visualDirectory, { recursive: true }); await page.screenshot({ path: join(visualDirectory, `detail-long-${width}.png`), fullPage: true }); }
    }
    assert.equal(state.writes.length, 0, "visual checks never mutate records");
  }, { viewport: { width, height: 1100 }, reducedMotion: "reduce" }));
}
