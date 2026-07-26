import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the Brilliant Life dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /璀璨人生/);
  assert.match(html, /训练成果/);
  assert.match(html, /工作日历/);
  assert.match(html, /23 个工作日/);
  assert.match(html, /今日步数/);
  assert.match(html, /我的习惯/);
  assert.match(html, /本月工资计算/);
  assert.match(html, /预计实发工资/);
  assert.match(html, /6,159\.15/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview/);
});
