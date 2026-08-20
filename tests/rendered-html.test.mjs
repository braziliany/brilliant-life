import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
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
  if (child.exitCode === null) child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000)),
  ]);
  if (child.exitCode === null && child.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
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

const render = async () => {
  const root = mkdtempSync(join(tmpdir(), "brilliant-life-render-"));
  const persistence = join(root, "persistence");
  const xdg = join(root, "xdg");
  mkdirSync(persistence);
  mkdirSync(xdg);
  const port = await availablePort();
  const inspectorPort = await availablePort();
  const child = spawn(process.execPath, [
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
  child.stderr?.on("data", (chunk) => { diagnostics += chunk.toString(); });
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Local Worker exited before rendering. ${diagnostics}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
        const body = await response.arrayBuffer();
        return new Response(body, response);
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
      }
    }
    throw new Error(`Local Worker did not become ready. ${diagnostics}`);
  } finally {
    await stopWorker(child);
    rmSync(root, { recursive: true, force: true });
  }
};

test("renders the current Brilliant Life dashboard in the local Workers runtime", { timeout: 60_000 }, async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /璀璨人生/);
  assert.match(html, /数据中心/);
  assert.match(html, /查看今年/);
  assert.match(html, /今日状态/);
  assert.match(html, /今日步数/);
  assert.match(html, /健康趋势/);
  assert.match(html, /本月工作/);
  assert.match(html, /预计实发/);
  assert.match(html, /职业经历/);
  assert.doesNotMatch(html, /网站导航|升级计划|我的习惯|健康生活仪表盘|codex-preview|SkeletonPreview/);
});
