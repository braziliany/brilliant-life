import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { countCalendarMonthWorkdays, resolveCalendarDay } from "../app/features/calendar/domain.ts";
import { getShanghaiToday } from "../app/features/calendar/widget-contract.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const wranglerCli = join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");

const availablePort = () => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    server.close((error) => error ? reject(error) : resolvePort(port));
  });
});

const stopWorker = async (child) => {
  // On Windows, killing only Wrangler can orphan its workerd child. Stop the
  // known test process tree before waiting for the parent to exit.
  if (child.exitCode === null && process.platform === "win32" && child.pid) {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 3_000 });
    } catch {
      child.kill();
    }
  } else if (child.exitCode === null) child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("close", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000)),
  ]);
  if (child.exitCode === null && child.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", timeout: 3_000 });
      } catch {
        // The process may have exited between the status check and taskkill.
      }
    } else {
      child.kill("SIGKILL");
    }
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
};

const render = async (verifyCalendar = false) => {
  // Use the ignored, workspace-owned local runtime directory rather than a
  // Windows short-path Temp alias. Each render still gets isolated persistence.
  const harnessDirectory = join(projectRoot, ".wrangler");
  mkdirSync(harnessDirectory, { recursive: true });
  const root = mkdtempSync(join(harnessDirectory, "brilliant-life-render-"));
  const persistence = join(root, "persistence");
  const xdg = join(root, "xdg");
  mkdirSync(persistence);
  mkdirSync(xdg);
  const port = await availablePort();
  const inspectorPort = await availablePort();
  let child;
  try {
  if (verifyCalendar) {
    const migrations = join(projectRoot, "drizzle");
    const sql = readdirSync(migrations).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort().map(name => readFileSync(join(migrations, name), "utf8")).join("\n");
    const seedFile = join(root, "calendar-schema.sql");
    writeFileSync(seedFile, sql);
    execFileSync(process.execPath, [wranglerCli, "d1", "execute", "DB", "--local", "--persist-to", persistence, "--config", join(projectRoot, "dist", "server", "wrangler.json"), "--file", seedFile], {
      cwd: projectRoot, env: { ...process.env, XDG_CONFIG_HOME: xdg }, stdio: ["ignore", "pipe", "pipe"], timeout: 15000,
    });
  }
  child = spawn(process.execPath, [
    wranglerCli,
    "dev",
    "--config",
    join(projectRoot, "dist", "server", "wrangler.json"),
    "--port",
    String(port),
    "--inspector-port",
    String(inspectorPort),
    "--ip",
    "127.0.0.1",
    "--local",
    "--persist-to",
    persistence,
    "--log-level",
    "error",
    "--show-interactive-dev-session=false",
  ], {
    cwd: projectRoot,
    env: { ...process.env, XDG_CONFIG_HOME: xdg },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let diagnostics = "";
  // Drain both pipes so startup output cannot block the child process.
  child.stdout?.on("data", (chunk) => { diagnostics += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { diagnostics += chunk.toString(); });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Local Worker exited before rendering. ${diagnostics}`);
      let response;
      try { response = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } }); } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
        continue;
      }
      const body = await response.arrayBuffer();
      if (verifyCalendar) {
        await verifyCalendarApi(`http://127.0.0.1:${port}`);
        await verifyPossessionsApi(`http://127.0.0.1:${port}`);
      }
      return new Response(body, response);
    }
    throw new Error(`Local Worker did not become ready. ${diagnostics}`);
  } finally {
    if (child) await stopWorker(child);
    if (process.platform === "win32") {
      // Native Windows cleanup avoids the observed Node recursive-rm EPERM.
      // Validate the exact owned test directory before deleting anything.
      execFileSync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", [
        "$renderCleanupTarget = [IO.Path]::GetFullPath($env:PULSE_RENDER_ROOT)",
        "$renderCleanupParent = [IO.Path]::GetFullPath($env:PULSE_RENDER_PARENT)",
        "if ([IO.Path]::GetDirectoryName($renderCleanupTarget) -ne $renderCleanupParent -or [IO.Path]::GetFileName($renderCleanupTarget) -notlike 'brilliant-life-render-*') { throw 'Unexpected test cleanup target' }",
        "Remove-Item -LiteralPath $renderCleanupTarget -Recurse -Force -Confirm:$false -ErrorAction Stop",
      ].join("\n")], {
        env: { ...process.env, PULSE_RENDER_ROOT: root, PULSE_RENDER_PARENT: harnessDirectory },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      });
      assert.equal(existsSync(root), false, "owned test runtime directory is removed");
    } else {
      rmSync(root, { recursive: true, force: true });
    }
  }
};

test("renders the current Brilliant Life dashboard in the local Workers runtime", { timeout: 60_000 }, async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /璀璨人生/);
  assert.match(html, /查看记录/);
  assert.doesNotMatch(html, /进入数据中心/);
  assert.match(html, /查看今年/);
  assert.match(html, /今日状态/);
  assert.match(html, /今日步数/);
  assert.match(html, /健康趋势/);
  assert.match(html, /本月工作/);
  assert.match(html, /预计工资/);
  assert.match(html, /职业经历/);
  assert.doesNotMatch(html, /网站导航|升级计划|我的习惯|健康生活仪表盘|codex-preview|SkeletonPreview/);
});

async function verifyCalendarApi(origin) {
  const get = async path => {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const mutate = async (path, payload, method = "PUT") => {
    const response = await fetch(`${origin}${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200, `${method} ${path}: ${await response.text()}`);
  };
  const month = getShanghaiToday(new Date()).slice(0, 7);
  const date = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  await mutate("/api/calendar", { date, isWorkday: false });
  await mutate("/api/calendar-work", { date, worked: true, hours: 8 });
  // A fresh HTTP GET exercises the same persisted data used after page refresh.
  const reloaded = await get(`/api/calendar?month=${month}`);
  assert.equal(reloaded.overrides[0].isWorkday, false);
  assert.equal(reloaded.workRecords[0].hours, 8);
  const widget = await get(`/api/v1/calendar/widget?month=${month}`);
  assert.equal(widget.days[0].isWorkday, true);
  assert.equal(widget.days[0].personalOverride, "restday");
  const annual = await get(`/api/annual?year=${year}`);
  assert.equal(annual.summary.time.facts.months[monthNumber - 1].workdays, countCalendarMonthWorkdays(year, monthNumber - 1, { [date]: false }, { [date]: { worked: true, hours: 8 } }));
  await mutate("/api/calendar", { month }, "DELETE");
  const reset = await get(`/api/calendar?month=${month}`);
  assert.equal(reset.overrides.length, 0);
  assert.equal(reset.workRecords[0].hours, 8);
  await mutate("/api/calendar-work", { date }, "DELETE");
  const cleared = await get(`/api/v1/calendar/widget?month=${month}`);
  assert.equal(cleared.days[0].isWorkday, resolveCalendarDay(year, monthNumber - 1, 1, {}).officialWorkday);
  await mutate("/api/calendar-work", { date: "2026-10-10", worked: false, hours: 0 });
  const makeupRest = await get("/api/calendar?month=2026-10");
  assert.equal(makeupRest.workRecords.find(row => row.date === "2026-10-10").hours, 0);
  await mutate("/api/calendar-work", { date: "2027-01-02", worked: true, hours: 8 });
  assert.equal((await get("/api/calendar?month=2027-01")).workRecords[0].hours, 8);
  assert.equal((await get("/api/calendar?year=2026")).workRecords.some(row => row.date === "2027-01-02"), false);
}

test("Calendar actual work persists through Worker APIs, reload, reset and year switches", { timeout: 60_000 }, async () => {
  assert.equal((await render(true)).status, 200);
});

async function verifyPossessionsApi(origin) {
  const request = async (path, method = "GET", payload, expected = 200) => {
    const response = await fetch(`${origin}${path}`, { method, ...(payload === undefined ? {} : { headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) }) });
    const text = await response.text(); assert.equal(response.status, expected, `${method} ${path}: ${text}`); return JSON.parse(text);
  };
  const page = await fetch(`${origin}/possessions`); assert.equal(page.status, 200); assert.match(await page.text(), /物品|POSSESSIONS/);
  const value = { name: "仅本地的合成物品", category: "其他", purchasePriceCents: 0 };
  const created = (await request("/api/possessions/items", "POST", value, 201)).record;
  assert.equal(created.purchaseDate, null); assert.equal(created.purchasePriceCents, 0);
  const usedOn = getShanghaiToday(new Date());
  const use = (await request("/api/possessions/uses", "POST", { itemId: created.id, usedOn }, 201)).record;
  const read = () => request(`/api/possessions?itemId=${created.id}`);
  assert.equal((await read()).item.metrics.recordedUses, 1);
  await request("/api/possessions/uses", "PUT", { id: use.id, itemId: created.id, usedOn: "2024-02-29", count: 3 });
  assert.equal((await read()).item.metrics.recordedUses, 3);
  await request("/api/possessions/items", "PATCH", { id: created.id, archived: true });
  assert.equal((await read()).uses.length, 1);
  await request("/api/possessions/uses", "DELETE", { id: use.id, itemId: created.id });
  assert.equal((await read()).item.metrics.recordedUses, 0);
  await request("/api/possessions/items", "POST", { ...value, purchaseDate: "2026-02-30" }, 400);
  const wish = (await request("/api/possessions/wishes", "POST", { name: "仅本地的合成愿望", budgetCents: 10000, status: "purchased" }, 201)).record;
  const converted = (await request("/api/possessions/convert", "POST", { wishId: wish.id, item: { name: "从愿望转入", category: "其他" } }, 201)).item;
  assert.equal(converted.purchasePriceCents, null); assert.equal(converted.sourceWishId, wish.id);
  await request("/api/possessions/convert", "POST", { wishId: wish.id, item: { name: "从愿望转入", category: "其他" } }, 409);
  const forbidden = await fetch(`${origin}/api/possessions/items`, { method: "POST", headers: { Origin: "https://other.example.com", "Content-Type": "application/json" }, body: JSON.stringify(value) });
  assert.equal(forbidden.status, 403);
}
