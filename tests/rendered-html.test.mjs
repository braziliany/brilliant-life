import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

const render = async () => {
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
  // Drain both pipes so startup output cannot block the child process.
  child.stdout?.on("data", (chunk) => { diagnostics += chunk.toString(); });
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
