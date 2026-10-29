import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = () => new Promise((accept, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(error => error ? reject(error) : accept(value)); });
});

// Real built Worker + private D1 persistence. Never uses the LAN preview state,
// remote bindings, credentials, request interception or a mock transport.
export async function possessionsWorker() {
  const evidence = join(root, ".wrangler", "possessions-phase12"); mkdirSync(evidence, { recursive: true });
  const directory = mkdtempSync(join(evidence, "worker-"));
  const persistence = join(directory, "state"), xdg = join(directory, "xdg"); mkdirSync(xdg);
  const generated = join(root, "dist", "server", "wrangler.json");
  const built = JSON.parse(readFileSync(generated, "utf8"));
  const config = join(directory, "wrangler.json");
  writeFileSync(config, JSON.stringify({ name: "pulse-possessions-test", main: resolve(dirname(generated), built.main),
    compatibility_date: built.compatibility_date, compatibility_flags: built.compatibility_flags, no_bundle: true, rules: built.rules,
    workers_dev: false, preview_urls: false, assets: { directory: resolve(dirname(generated), built.assets.directory) },
    d1_databases: [{ binding: "DB", database_name: "possessions-test-only", database_id: "00000000-0000-4000-8000-000000000012" }] }));
  const cli = join(root, "node_modules", "wrangler", "wrangler-dist", "cli.js");
  const env = { ...process.env, XDG_CONFIG_HOME: xdg, WRANGLER_SEND_METRICS: "false", WRANGLER_HIDE_BANNER: "true", WRANGLER_WRITE_LOGS: "false" };
  const execute = args => execFileSync(process.execPath, [cli, "d1", "execute", "DB", "--local", "--config", config, "--persist-to", persistence, ...args], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const sql = join(directory, "schema.sql");
  writeFileSync(sql, readdirSync(join(root, "drizzle")).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort().map(name => readFileSync(join(root, "drizzle", name), "utf8")).join("\n"));
  execute(["--file", sql]);
  const serverPort = await port(), inspector = await port();
  let child, browser, diagnostics = "";
  const close = async () => {
    await browser?.close();
    if (child && child.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
      await new Promise(accept => child.once("close", accept));
    }
    writeFileSync(join(directory, "worker.log"), diagnostics);
  };
  try {
    child = spawn(process.execPath, [cli, "dev", "--config", config, "--local", "--persist-to", persistence, "--ip", "127.0.0.1", "--port", String(serverPort), "--inspector-port", String(inspector), "--log-level", process.env.PULSE_WORKER_DEBUG ? "debug" : "error", "--show-interactive-dev-session=false"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => { diagnostics += data; }); child.stderr.on("data", data => { diagnostics += data; });
    child.on("exit", (code, signal) => { diagnostics += `\nWorker exit code=${code} signal=${signal}\n`; });
    const origin = `http://127.0.0.1:${serverPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw Error(diagnostics);
      try { const response = await fetch(`${origin}/api/possessions`); if (response.ok) { ready = true; break; } } catch {}
      await new Promise(accept => setTimeout(accept, 500));
    }
    assert.ok(ready, `Local Worker startup: ${diagnostics}`);
    const require = createRequire(import.meta.url);
    const loaded = await import(pathToFileURL(require.resolve(process.env.CALENDAR_PLAYWRIGHT_PATH ?? join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright"))).href);
    browser = await (loaded.default ?? loaded).chromium.launch({ headless: true, ...(process.env.CALENDAR_BROWSER_EXECUTABLE ? { executablePath: process.env.CALENDAR_BROWSER_EXECUTABLE } : { channel: process.env.CALENDAR_BROWSER_CHANNEL ?? "msedge" }) });
    writeFileSync(join(evidence, "latest-worker.json"), JSON.stringify({ directory, origin, isolatedD1: true, previewPort: 4186, previewUntouched: true }, null, 2));
    return { browser, origin, directory, close, query: command => {
      // Read the same D1 SQLite file without starting a second Wrangler runtime
      // against live persistence. The test inspector cannot modify the file.
      const files = readdirSync(join(persistence, "v3", "d1"), { recursive: true });
      const file = files.find(name => /[a-f0-9]{64}\.sqlite$/.test(name));
      assert.ok(file, "D1 persistence exists");
      const database = new DatabaseSync(join(persistence, "v3", "d1", file), { readOnly: true });
      try { return database.prepare(command).all(); } finally { database.close(); }
    } };
  } catch (error) { await close(); throw error; }
}
