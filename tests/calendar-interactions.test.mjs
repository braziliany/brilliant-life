import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

// Actual ReactDOM/browser component interactions, using the existing node:test
// suite and bundled browser tooling. Controlled fixture HTTP is not an API,
// database, full dashboard, Cloudflare Access or iPhone end-to-end test.
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const bundlePlaywright = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
async function loadPlaywright() {
  const candidates = [process.env.CALENDAR_PLAYWRIGHT_PATH, "playwright", bundlePlaywright].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const loaded = await import(pathToFileURL(require.resolve(candidate)).href);
      return loaded.default ?? loaded;
    }
    catch (error) {
      if (candidate !== candidates.at(-1)) continue;
      throw new Error("Calendar browser interactions require existing Playwright; set CALENDAR_PLAYWRIGHT_PATH to its package directory.", { cause: error });
    }
  }
}

let server;
let browser;
let baseUrl;
before(async () => {
  server = await createServer({
    root, configFile: false, plugins: [react()], appType: "custom",
    cacheDir: join(tmpdir(), "pulse-calendar-interactions-vite"),
    server: { host: "127.0.0.1", port: 0 },
    optimizeDeps: { include: ["react", "react-dom/client"] },
  });
  server.middlewares.use(async (request, response, next) => {
    if (request.url?.split("?")[0] !== "/") return next();
    try {
      const html = await server.transformIndexHtml("/", '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/calendar-interactions.tsx"></script></body></html>');
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(html);
    } catch (error) { next(error); }
  });
  await server.listen();
  baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
  const { chromium } = await loadPlaywright();
  const edgeExecutable = process.env.CALENDAR_BROWSER_EXECUTABLE;
  browser = await chromium.launch(edgeExecutable && existsSync(edgeExecutable)
    ? { executablePath: edgeExecutable, headless: true }
    : { channel: process.env.CALENDAR_BROWSER_CHANNEL ?? "msedge", headless: true });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function withPage(fixture, action, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await action(page, async () => {
      await page.goto(`${baseUrl}/?fixture=${fixture}`);
      await page.locator("#root > main").waitFor({ state: "visible", timeout: 5000 });
    });
    assert.deepEqual(errors, [], "component runtime has no browser exceptions");
  } catch (error) {
    if (errors.length) error.message += `\nBrowser exceptions: ${errors.join("; ")}`;
    throw error;
  } finally { await context.close(); }
}

const successfulSave = async route => route.fulfill({ json: { value: route.request().postDataJSON().value } });
const planForm = page => page.getByRole("form", { name: "我的安排表单", exact: true });
const actualForm = page => page.getByRole("form", { name: "实际记录表单", exact: true });
// Keep the original twelve behavior assertions while exercising native radio
// labels instead of the previous select. This is an actual browser click.
const plan = page => ({
  selectOption: async value => planForm(page).locator(`label:has(input[type="radio"][value="${value}"])`).click(),
  inputValue: async () => planForm(page).locator('input[type="radio"]:checked').inputValue(),
});
const actual = page => actualForm(page).getByRole("combobox", { name: "出勤状态", exact: true });
const hours = page => actualForm(page).getByRole("spinbutton");
const savePlan = page => page.getByRole("button", { name: "保存安排", exact: true });
const saveRecord = page => page.getByRole("button", { name: "保存记录", exact: true });
const julyCount = page => page.locator(".annualMonths button").nth(6).locator("strong");
const annualStatus = page => page.getByTestId("annual-load-status");
const yearPayload = (year, rows = []) => ({ overrides: [], workRecords: rows.map(([day, worked = true, hours = 8]) => ({ date: `${year}-${day}`, worked, hours })) });
const july24 = yearPayload(2026, [["07-05"]]);
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

test("browser: saving an arrangement preserves an eight-hour draft; both saved forms survive reload", async () => withPage("editor", async (page, open) => {
  await page.route("**/fixture/save?*", successfulSave);
  await open();
  await actual(page).selectOption("work");
  await hours(page).fill("8");
  await plan(page).selectOption("rest");
  await savePlan(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"arrangement":false' }).waitFor();
  assert.equal(await actual(page).inputValue(), "work");
  assert.equal(await hours(page).inputValue(), "8");
  await saveRecord(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"hours":8' }).waitFor();
  await page.reload();
  assert.equal(await plan(page).inputValue(), "rest");
  assert.equal(await actual(page).inputValue(), "work");
  assert.equal(await hours(page).inputValue(), "8");
  await plan(page).selectOption("default");
  await savePlan(page).click();
  await page.waitForFunction(() => !JSON.parse(document.querySelector('[data-testid="saved-data"]').textContent)["2026-07-05"].hasOwnProperty("arrangement"));
  await page.reload();
  assert.equal(await plan(page).inputValue(), "default");
  assert.equal(await actual(page).inputValue(), "work");
  assert.equal(await hours(page).inputValue(), "8");
}));

test("browser: saving actual attendance preserves a dirty personal arrangement", async () => withPage("editor", async (page, open) => {
  await page.route("**/fixture/save?*", successfulSave);
  await open();
  await plan(page).selectOption("work");
  await actual(page).selectOption("work");
  await hours(page).fill("8");
  await saveRecord(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"hours":8' }).waitFor();
  assert.equal(await plan(page).inputValue(), "work");
  await savePlan(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"arrangement":true' }).waitFor();
  await page.reload();
  assert.equal(await plan(page).inputValue(), "work");
  assert.equal(await hours(page).inputValue(), "8");
}));

test("browser: independent save errors retain both drafts and retry only commits the successful form", async () => withPage("editor", async (page, open) => {
  let fail = true;
  await page.route("**/fixture/save?*", route => fail ? route.fulfill({ status: 500, json: { error: "unavailable" } }) : successfulSave(route));
  await open();
  await plan(page).selectOption("rest");
  await actual(page).selectOption("work");
  await hours(page).fill("8");
  await savePlan(page).click();
  await planForm(page).getByText(/保存失败，请重试/).waitFor();
  await saveRecord(page).click();
  await actualForm(page).getByText(/保存失败，请重试/).waitFor();
  assert.equal(await plan(page).inputValue(), "rest");
  assert.equal(await hours(page).inputValue(), "8");
  assert.deepEqual(JSON.parse(await page.getByTestId("saved-data").innerText()), {});
  fail = false;
  await savePlan(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"arrangement":false' }).waitFor();
  assert.equal(await hours(page).inputValue(), "8");
  await actualForm(page).getByText(/保存失败，请重试/).waitFor();
}));

test("browser: successful decimal input normalization retains saved status while failure preserves the original draft", async () => withPage("editor", async (page, open) => {
  let fail = true;
  await page.route("**/fixture/save?*", route => fail ? route.fulfill({ status: 500, json: { error: "unavailable" } }) : successfulSave(route));
  await open();
  await plan(page).selectOption("rest");
  await actual(page).selectOption("work");
  await hours(page).fill("8.0");
  await saveRecord(page).click();
  await actualForm(page).getByText(/保存失败，请重试/).waitFor();
  assert.equal(await hours(page).inputValue(), "8.0", "failed save preserves the user's legitimate numeric text");
  assert.equal(await plan(page).inputValue(), "rest");
  assert.deepEqual(JSON.parse(await page.getByTestId("saved-data").innerText()), {});
  fail = false;
  await saveRecord(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"hours":8' }).waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await actualForm(page).getByText("已保存", { exact: true }).count(), 1, "saved confirmation survives the canonical numeric parent props and effects");
  assert.equal(await hours(page).inputValue(), "8");
  assert.equal(await plan(page).inputValue(), "rest", "normalizing the saved attendance does not touch the arrangement draft");
  assert.deepEqual(JSON.parse(await page.getByTestId("saved-data").innerText()), { "2026-07-05": { record: { worked: true, hours: 8 } } });
}));

test("browser: an in-flight save is visibly busy and success preserves the other draft", async () => withPage("editor", async (page, open) => {
  const pending = gate();
  const requested = gate();
  await page.route("**/fixture/save?*", async route => { requested.release(); await pending.promise; await successfulSave(route); });
  await open();
  await plan(page).selectOption("rest");
  await actual(page).selectOption("work");
  await hours(page).fill("8");
  await savePlan(page).click();
  await requested.promise;
  assert.equal(await savePlan(page).isDisabled(), true);
  assert.equal(await saveRecord(page).isDisabled(), true);
  assert.equal(await page.locator(".calendarDateEditor select, .calendarDateEditor input, .calendarDateEditor button").evaluateAll(elements => elements.every(element => element.disabled)), true, "every editor input and action is disabled during the save");
  assert.equal(await hours(page).inputValue(), "8");
  pending.release();
  await page.getByTestId("saved-data").filter({ hasText: '"arrangement":false' }).waitFor();
  await saveRecord(page).waitFor({ state: "visible" });
  assert.equal(await hours(page).inputValue(), "8");
}));

test("browser: clean external updates synchronize while dirty fields retain input and show a notice", async () => withPage("editor", async (page, open) => {
  await page.route("**/fixture/save?*", successfulSave);
  await open();
  await page.evaluate(() => window.calendarFixture.updateSaved("2026-07-05", { arrangement: true, record: { worked: true, hours: 4 } }));
  await page.waitForFunction(() => document.querySelector('input[type="number"]')?.value === "4");
  assert.equal(await plan(page).inputValue(), "work");
  await plan(page).selectOption("rest");
  await hours(page).fill("8");
  await page.evaluate(() => window.calendarFixture.updateSaved("2026-07-05", { record: { worked: true, hours: 6 } }));
  await actualForm(page).getByText(/更新|变化/).waitFor();
  await planForm(page).getByText(/更新|变化/).waitFor();
  assert.equal(await plan(page).inputValue(), "rest");
  assert.equal(await hours(page).inputValue(), "8");
  // Successful user save settles this form, without discarding the other draft.
  await saveRecord(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"hours":8' }).waitFor();
  assert.equal(await plan(page).inputValue(), "rest");
}));

test("browser: changing dates and months cannot submit the previous date's draft", async () => withPage("editor", async (page, open) => {
  const requests = [];
  await page.route("**/fixture/save?*", async route => { requests.push(route.request().postDataJSON()); await successfulSave(route); });
  await open();
  await plan(page).selectOption("rest");
  await actual(page).selectOption("work");
  await hours(page).fill("8");
  await page.getByRole("button", { name: "选择六日", exact: true }).click();
  assert.equal(await plan(page).inputValue(), "default");
  assert.equal(await actual(page).inputValue(), "unknown");
  await actual(page).selectOption("work");
  await hours(page).fill("6");
  await saveRecord(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"hours":6' }).waitFor();
  await page.getByRole("button", { name: "切换八月", exact: true }).click();
  assert.equal(await page.locator(".calendarDateEditor").count(), 0);
  await page.getByRole("button", { name: "选择五日", exact: true }).click();
  assert.equal(await actual(page).inputValue(), "unknown");
  await plan(page).selectOption("work");
  await savePlan(page).click();
  await page.getByTestId("saved-data").filter({ hasText: '"2026-08-05"' }).waitFor();
  assert.deepEqual(requests, [{ date: "2026-07-06", value: { worked: true, hours: 6 } }, { date: "2026-08-05", value: true }]);
}));

test("browser: annual success includes actual weekend attendance in July's 24 workdays", async () => withPage("annual", async (page, open) => {
  await page.route("**/api/calendar?year=*", route => route.fulfill({ json: july24 }));
  await open();
  await annualStatus(page).filter({ hasText: "ready" }).waitFor();
  assert.equal(await julyCount(page).innerText(), "24");
}));

test("browser: first annual failure has no invented totals and UI retry recovers correct facts", async () => withPage("annual", async (page, open) => {
  let fail = true;
  await page.route("**/api/calendar?year=*", route => fail ? route.fulfill({ status: 503, json: { error: "unavailable" } }) : route.fulfill({ json: july24 }));
  await open();
  await annualStatus(page).filter({ hasText: "error" }).waitFor();
  assert.equal(await page.locator(".annualMonths").count(), 0);
  assert.equal(await page.locator(".annualTotal").count(), 0);
  await page.getByRole("alert").getByText(/失败/).waitFor();
  fail = false;
  await page.getByRole("button", { name: /重试|重新读取|重新加载全年/ }).last().click();
  await annualStatus(page).filter({ hasText: "ready" }).waitFor();
  assert.equal(await julyCount(page).innerText(), "24");
}));

test("browser: a failed annual refresh retains verified cache and warns that it may be stale", async () => withPage("annual", async (page, open) => {
  let fail = false;
  await page.route("**/api/calendar?year=*", route => fail ? route.fulfill({ status: 503, json: { error: "unavailable" } }) : route.fulfill({ json: july24 }));
  await open();
  await annualStatus(page).filter({ hasText: "ready" }).waitFor();
  fail = true;
  await page.getByRole("button", { name: "重新读取当前年", exact: true }).click();
  await annualStatus(page).filter({ hasText: "error" }).waitFor();
  assert.equal(await julyCount(page).innerText(), "24");
  await page.getByRole("alert").getByText(/缓存|更新|已读取|上次/).waitFor();
}));

test("browser: annual loading never presents uncached defaults and a failed new year cannot reuse another year's cache", async () => withPage("annual", async (page, open) => {
  const pending = gate();
  await page.route("**/api/calendar?year=*", async route => {
    if (new URL(route.request().url()).searchParams.get("year") === "2026") return route.fulfill({ json: july24 });
    await pending.promise;
    await route.fulfill({ status: 500, json: { error: "unavailable" } });
  });
  await open();
  await annualStatus(page).filter({ hasText: "ready" }).waitFor();
  await page.getByRole("button", { name: "选择2027年", exact: true }).click();
  await annualStatus(page).filter({ hasText: "loading" }).waitFor();
  assert.equal(await page.locator(".annualMonths").count(), 0);
  assert.equal(await page.locator(".annualTotal").count(), 0);
  pending.release();
  await annualStatus(page).filter({ hasText: "error" }).waitFor();
  assert.equal(await page.locator(".annualMonths").count(), 0);
  await page.getByRole("button", { name: "选择2026年", exact: true }).click();
  await annualStatus(page).filter({ hasText: "ready" }).waitFor();
  assert.equal(await julyCount(page).innerText(), "24");
}));

test("browser: late responses from a previously selected year cannot replace the current year's facts", async () => withPage("annual", async (page, open) => {
  const oldRequest = gate();
  const releaseOld = gate();
  const oldFinished = gate();
  await page.route("**/api/calendar?year=*", async route => {
    const year = new URL(route.request().url()).searchParams.get("year");
    if (year === "2026") {
      oldRequest.release();
      await releaseOld.promise;
      try { await route.fulfill({ json: july24 }); } catch { /* Aborted fetch is an expected stale-request outcome. */ }
      finally { oldFinished.release(); }
    } else await route.fulfill({ json: yearPayload(2027) });
  });
  await open();
  await oldRequest.promise;
  await page.getByRole("button", { name: "选择2027年", exact: true }).click();
  await annualStatus(page).filter({ hasText: "ready" }).waitFor();
  const currentJuly = await julyCount(page).innerText();
  releaseOld.release();
  await oldFinished.promise;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await julyCount(page).innerText(), currentJuly);
  assert.equal(await page.locator(".annualTotal small").innerText(), "2027 年度统计");
}));

test("browser: native arrangement radios support keyboard selection while unknown, zero and clear keep separate meanings", async () => withPage("editor", async (page, open) => {
  const requests = [];
  await page.route("**/fixture/save?*", async route => { requests.push(route.request().postDataJSON()); await successfulSave(route); });
  await open();
  const defaultRadio = planForm(page).getByRole("radio", { name: "默认", exact: true });
  await defaultRadio.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await plan(page).inputValue(), "rest", "native radio arrow keys select the preceding choice");
  await savePlan(page).click();
  await planForm(page).getByText("已保存", { exact: true }).waitFor();
  await actual(page).selectOption("work");
  await saveRecord(page).click();
  await actualForm(page).getByText("已保存", { exact: true }).waitFor();
  assert.equal(requests.at(-1).value.hours, null, "an empty duration is unknown, not a fabricated eight hours or zero");
  await actual(page).selectOption("rest");
  await hours(page).fill("0");
  await saveRecord(page).click();
  await actualForm(page).getByText("已保存", { exact: true }).waitFor();
  assert.deepEqual(requests.at(-1).value, { worked: false, hours: 0 });
  await plan(page).selectOption("default");
  await savePlan(page).click();
  await planForm(page).getByText("已保存", { exact: true }).waitFor();
  assert.equal(requests.at(-1).value, null, "default clears only the personal arrangement");
  assert.equal(await actual(page).inputValue(), "rest");
  assert.equal(await hours(page).inputValue(), "0");
  await actual(page).selectOption("unknown");
  assert.equal(await hours(page).count(), 0, "unrecorded attendance has no misleading duration field");
  await saveRecord(page).click();
  await actualForm(page).getByText("已保存", { exact: true }).waitFor();
  assert.equal(requests.at(-1).value, null, "unrecorded explicitly clears actual attendance");
  assert.deepEqual(JSON.parse(await page.getByTestId("saved-data").innerText()), { "2026-07-05": {} });
  await page.getByRole("button", { name: "关闭日期编辑", exact: true }).click();
  assert.equal(await page.locator(".calendarDateEditor").count(), 0);
}));

// Chromium/Edge responsive rendering is a real browser check with the production
// stylesheet. It is not an iPhone Safari or hardware visual acceptance claim.
async function assertMobileEditorFits(page, width, state) {
  const measurements = await page.locator(".calendarDateEditor").evaluate(editor => {
    const bounds = editor.getBoundingClientRect();
    const describe = element => `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).replaceAll(" ", ".")}` : ""} ${element.textContent?.trim().slice(0, 32) || element.getAttribute("aria-label") || ""}`;
    const measurable = [...editor.querySelectorAll("*")].filter(element => {
      const style = getComputedStyle(element);
      return !(element instanceof HTMLInputElement && element.type === "radio") && style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
    });
    const overflowing = measurable.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1);
    }).map(describe);
    const fieldMinimums = [...editor.querySelectorAll('form,fieldset,label,select,input[type="number"]')].map(element => ({ name: describe(element), minWidth: getComputedStyle(element).minWidth }));
    const textFields = [...editor.querySelectorAll('select,input[type="number"]')].map(element => ({ name: describe(element), fontSize: parseFloat(getComputedStyle(element).fontSize) }));
    const targets = [...editor.querySelectorAll('button,select,input[type="number"],label:has(input[type="radio"])')].map(element => ({ name: describe(element), height: element.getBoundingClientRect().height }));
    const card = editor.closest(".card.calendar").getBoundingClientRect();
    return { overflowing, fieldMinimums, textFields, targets, cardLeft: card.left, cardRight: card.right, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
  });
  const label = `${width}px ${state}`;
  assert.deepEqual(measurements.overflowing, [], `${label}: all editor nodes fit even though global CSS clips horizontal page overflow`);
  assert.equal(measurements.viewportWidth, width, `${label}: viewport meta uses the requested CSS width`);
  assert.ok(measurements.documentWidth <= width + 1, `${label}: document has no hidden horizontal overflow`);
  assert.ok(measurements.cardLeft >= 0 && measurements.cardRight <= width + 1, `${label}: actual calendar card stays in the viewport`);
  for (const field of measurements.fieldMinimums) assert.equal(field.minWidth, "0px", `${label}: ${field.name} permits flex/grid shrinkage`);
  for (const field of measurements.textFields) assert.ok(field.fontSize >= 16, `${label}: ${field.name} does not trigger iOS small-input zoom`);
  for (const target of measurements.targets) assert.ok(target.height >= 44, `${label}: ${target.name} has a 44px touch target`);
}

for (const width of [320, 375, 390, 430]) {
  test(`browser: mobile editor fits ${width}px with duration, save errors and external-update controls`, async () => withPage("mobile", async (page, open) => {
    await page.route("**/fixture/save?*", route => route.fulfill({ status: 500, json: { error: "unavailable" } }));
    await open();
    const card = page.getByTestId("mobile-calendar-card");
    const screenshotDirectory = join(root, ".wrangler", "calendar-mobile-visual");
    mkdirSync(screenshotDirectory, { recursive: true });
    const screenshot = state => card.screenshot({ path: join(screenshotDirectory, `${width}-${state}.png`), animations: "disabled" });
    await page.getByText("10月17日 · 周六", { exact: true }).waitFor();
    await assertMobileEditorFits(page, width, "initial");
    await screenshot("initial");
    await plan(page).selectOption("rest");
    await actual(page).selectOption("work");
    await hours(page).fill("8");
    assert.equal(await hours(page).getAttribute("step"), "any", "visual refactor does not restrict legitimate decimal inputs");
    await assertMobileEditorFits(page, width, "eight-hour draft");
    await screenshot("work");
    await savePlan(page).click();
    await planForm(page).getByText(/保存失败，请重试/).waitFor();
    await saveRecord(page).click();
    await actualForm(page).getByText(/保存失败，请重试/).waitFor();
    assert.equal(await plan(page).inputValue(), "rest");
    assert.equal(await hours(page).inputValue(), "8");
    await assertMobileEditorFits(page, width, "independent save errors");
    await screenshot("errors");
    await page.evaluate(() => window.calendarFixture.updateSaved("2026-10-17", { arrangement: true, record: { worked: true, hours: 6 } }));
    await planForm(page).getByRole("button", { name: "使用服务器安排", exact: true }).waitFor();
    await actualForm(page).getByRole("button", { name: "使用服务器实际记录", exact: true }).waitFor();
    assert.equal(await plan(page).inputValue(), "rest");
    assert.equal(await hours(page).inputValue(), "8");
    await assertMobileEditorFits(page, width, "external-update notices");
    await screenshot("updates");
    await actualForm(page).getByRole("button", { name: "使用服务器实际记录", exact: true }).click();
    assert.equal(await hours(page).inputValue(), "6", "server update is accepted only by explicit user action");
    assert.equal(await plan(page).inputValue(), "rest", "accepting actual server data preserves the arrangement draft");
  }, { viewport: { width, height: 1100 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }));
}

// The production view mapper and domain are shared with this synthetic month.
// Only presentation and in-memory navigation are exercised; no database writes.
for (const width of [320, 375, 390, 430]) {
  test(`browser: ${width}px month keeps two final-state bars and an independent Today outline`, async () => withPage("month-visual", async (page, open) => {
    await open();
    const card = page.locator("#time");
    const expected = [
      { day: 1, work: true, facts: /国庆.*安排休息.*实际上班.*8小时/ },
      { day: 3, work: false, facts: /国庆.*法定休假/ },
      { day: 8, work: true, facts: /工作日/ },
      { day: 10, work: false, facts: /官方调休上班.*安排休息/ },
      { day: 11, work: false, facts: /周末休息/ },
      { day: 12, work: false, facts: /工作日.*安排上班.*实际未上班.*0小时/ },
      { day: 17, work: true, facts: /周末休息.*安排上班/ },
      { day: 18, work: true, facts: /周末休息.*安排休息.*实际上班.*0.5小时/ },
      { day: 19, work: true, facts: /实际上班.*工时未知/ },
    ];
    const directory = join(root, ".wrangler", "calendar-two-state-visual");
    mkdirSync(directory, { recursive: true });
    const initialCount = await card.locator(".calendarFacts b").first().innerText();
    assert.equal(initialCount, "19", "official facts, personal arrangements and actual records still use the domain count");
    for (const today of expected) {
      const todayKey = `2026-10-${String(today.day).padStart(2, "0")}`;
      await page.getByRole("combobox", { name: "测试 Today 日期", exact: true }).selectOption(todayKey);
      await page.waitForFunction(day => document.querySelector('#time [aria-current="date"] .dayNumber')?.textContent === String(day), today.day);
      const cells = await card.locator(".days>button").evaluateAll(buttons => buttons.map(button => {
        const number = button.querySelector(".dayNumber");
        return { day: Number(number.textContent), height: button.getBoundingClientRect().height,
          bar: getComputedStyle(button, ":before").backgroundColor, after: getComputedStyle(button, ":after").content,
          border: getComputedStyle(number).borderColor, borderWidth: parseFloat(getComputedStyle(number).borderWidth),
          radius: parseFloat(getComputedStyle(number).borderRadius), today: button.getAttribute("aria-current") === "date",
          text: button.textContent, aria: button.getAttribute("aria-label"), title: button.title,
          children: [...button.children].map(child => child.className) };
      }));
      assert.equal(cells.length, 31);
      assert.deepEqual([...new Set(cells.map(cell => cell.height))], [64]);
      assert.deepEqual([...new Set(cells.map(cell => cell.bar))].sort(), ["rgb(102, 106, 114)", "rgb(201, 244, 90)"].sort());
      assert.equal(cells.filter(cell => cell.today).length, 1);
      for (const scenario of expected) {
        const cell = cells.find(cell => cell.day === scenario.day);
        assert.equal(cell.bar, scenario.work ? "rgb(201, 244, 90)" : "rgb(102, 106, 114)", `${scenario.day}: Today must not replace the final work/rest bar`);
        assert.match(cell.aria, scenario.facts);
        assert.match(cell.title, scenario.facts);
      }
      for (const cell of cells) {
        assert.doesNotMatch(cell.text, /安排|实际|小时|工时/);
        assert.ok(cell.children.every(name => name === "dayNumber" || name === "holidayName"));
        assert.equal(cell.after, "none", "no corner dot, badge or additional Today marker");
        assert.equal(cell.border, cell.today ? "rgb(194, 140, 255)" : "rgba(0, 0, 0, 0)");
        assert.ok(cell.borderWidth > 0 && cell.radius > 0, "the outline uses the same rounded geometry for every date");
      }
      assert.deepEqual(await card.locator(".calendarLegend>span").allTextContents(), ["上班", "休息"]);
      assert.equal(await card.locator(".calendarFacts b").first().innerText(), initialCount, "Today is a visual overlay, not a workday override");
    }
    const overflow = await card.locator(".days").evaluate(grid => {
      const bounds = grid.getBoundingClientRect();
      return [...grid.querySelectorAll("*")].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1));
      }).map(element => element.className);
    });
    assert.deepEqual(overflow, [], "all date content stays inside the seven-column grid");
    await card.screenshot({ path: join(directory, `fixture-${width}.png`), animations: "disabled" });
    const holiday = card.getByRole("button", { name: /^10月1日，/ });
    await holiday.click();
    await page.locator(".calendarDateEditor").getByText("官方 · 国庆法定休假", { exact: true }).waitFor();
    assert.equal(await plan(page).inputValue(), "rest");
    assert.equal(await actual(page).inputValue(), "work");
    assert.equal(await hours(page).inputValue(), "8");
    await page.getByRole("button", { name: "关闭日期编辑", exact: true }).click();
    assert.equal(await page.locator(".calendarDateEditor").count(), 0);
  }, { viewport: { width, height: 1100 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }));
}
