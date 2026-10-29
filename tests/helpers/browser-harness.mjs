import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before } from "node:test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

// Shared existing Vite + Playwright + node:test harness. No application database.
export function browserHarness(fixtureFile, name) {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const require = createRequire(import.meta.url);
  let server, browser, baseUrl;
  before(async () => {
    server = await createServer({ root, configFile: false, plugins: [react()], appType: "custom",
      cacheDir: join(tmpdir(), `pulse-${name}-interactions-vite`),
      server: { host: "127.0.0.1", port: 0 }, optimizeDeps: { include: ["react", "react-dom/client"] } });
    server.middlewares.use(async (request, response, next) => {
      if (request.url?.split("?")[0] !== "/") return next();
      try {
        const html = await server.transformIndexHtml("/", `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/${fixtureFile}"></script></body></html>`);
        response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html);
      } catch (error) { next(error); }
    });
    await server.listen(); baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
    const bundled = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
    const candidates = [process.env.CALENDAR_PLAYWRIGHT_PATH, "playwright", bundled].filter(Boolean);
    let playwright;
    for (const candidate of candidates) {
      try { const loaded = await import(pathToFileURL(require.resolve(candidate)).href); playwright = loaded.default ?? loaded; break; }
      catch (error) { if (candidate === candidates.at(-1)) throw new Error("Browser interactions require existing Playwright; set CALENDAR_PLAYWRIGHT_PATH to its package directory.", { cause: error }); }
    }
    const executable = process.env.CALENDAR_BROWSER_EXECUTABLE;
    browser = await playwright.chromium.launch(executable && existsSync(executable) ? { executablePath: executable, headless: true } : { channel: process.env.CALENDAR_BROWSER_CHANNEL ?? "msedge", headless: true });
  });
  after(async () => { await browser?.close(); await server?.close(); });
  return async function withPage(fixture, action, contextOptions = {}) {
    const context = await browser.newContext(contextOptions), page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await action(page, async () => {
        await page.goto(`${baseUrl}/?fixture=${fixture}`);
        await page.locator("#root > main").waitFor({ state: "visible", timeout: 5000 });
      });
      assert.deepEqual(errors, [], "component runtime has no browser exceptions");
    } catch (error) { if (errors.length) error.message += `\nBrowser exceptions: ${errors.join("; ")}`; throw error; }
    finally { await context.close(); }
  };
}
