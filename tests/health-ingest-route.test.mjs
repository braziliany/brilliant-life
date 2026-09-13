import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  handleHealthIngestPost,
  healthIngestMethodNotAllowed,
} from "../app/features/health/ingest-api.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dashboardRoute = readFileSync(resolve(root, "app/api/health/route.ts"), "utf8");
const machineRoute = readFileSync(resolve(root, "app/api/health/ingest/route.ts"), "utf8");

function dependencies(overrides = {}) {
  return {
    configuredKey: "health-secret",
    now: () => new Date("2026-09-13T12:00:00.000Z"),
    async recordInvalidPayload() {},
    async ingest() {
      return Response.json({ imported: 1 });
    },
    ...overrides,
  };
}

function post(headers = {}, body = "{}") {
  return new Request("https://pulse.sophier.org/api/health/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

test("machine ingest rejects missing and wrong API keys before parsing or persistence", async () => {
  let writes = 0;
  const deps = dependencies({
    async recordInvalidPayload() { writes += 1; },
    async ingest() { writes += 1; return Response.json({ imported: 1 }); },
  });

  for (const request of [post(), post({ "X-API-Key": "wrong" })]) {
    const response = await handleHealthIngestPost(request, deps);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Invalid API key" });
  }
  assert.equal(writes, 0);
});

test("machine ingest returns 400 for malformed authenticated JSON without running ingestion", async () => {
  let invalidDiagnostics = 0;
  let ingestions = 0;
  const response = await handleHealthIngestPost(
    post({ "X-API-Key": "health-secret" }, "{"),
    dependencies({
      async recordInvalidPayload() { invalidDiagnostics += 1; },
      async ingest() { ingestions += 1; return Response.json({ imported: 1 }); },
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid JSON payload" });
  assert.equal(invalidDiagnostics, 1);
  assert.equal(ingestions, 0);
});

test("machine ingest delegates authenticated JSON to the shared ingest function", async () => {
  let received = null;
  const response = await handleHealthIngestPost(
    post({ "X-API-Key": "health-secret" }, JSON.stringify({ metrics: [] })),
    dependencies({
      async ingest(payload, receivedAt) {
        received = { payload, receivedAt };
        return Response.json({ imported: 0 });
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    payload: { metrics: [] },
    receivedAt: "2026-09-13T12:00:00.000Z",
  });
});

test("machine ingest rejects every non-POST method with an explicit Allow boundary", async () => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const response = healthIngestMethodNotAllowed();
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("Allow"), "POST", method);
    assert.deepEqual(await response.json(), { error: "Method not allowed" });
  }
});

test("machine route exposes no read handler and reuses the production ingest handler", () => {
  assert.match(machineRoute, /export const POST = handleHealthIngest/);
  assert.match(machineRoute, /export const GET = healthIngestMethodNotAllowed/);
  assert.doesNotMatch(machineRoute, /getDb|healthDaily|healthIngestionRuns|normalizeHealthIngestion/);
});

test("dashboard Health GET contract remains present and separate from machine methods", () => {
  assert.match(dashboardRoute, /export async function GET\(request: Request\)/);
  assert.match(dashboardRoute, /hasDashboardAccess\(request\)/);
  assert.match(dashboardRoute, /db\.select\(\)\.from\(healthDaily\)/);
  assert.match(dashboardRoute, /export const POST = handleHealthIngest/);
  assert.doesNotMatch(dashboardRoute, /healthIngestMethodNotAllowed/);
});
