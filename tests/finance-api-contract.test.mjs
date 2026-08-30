import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const route = readFileSync(resolve(root, "app/api/finance/route.ts"), "utf8");
const types = readFileSync(resolve(root, "app/features/finance/types.ts"), "utf8");
const writeService = readFileSync(resolve(root, "app/features/finance/write-service.ts"), "utf8");

test("finance GET keeps one authenticated endpoint with bounded pagination", () => {
  assert.match(route, /hasDashboardAccess\(request\)/);
  assert.match(route, /pageSize > 50/);
  assert.match(route, /paginateFinanceTransactions\(records, page, pageSize\)/);
  assert.doesNotMatch(route, /export async function DELETE/);
});

test("finance PATCH is authenticated, same-origin, JSON-only, and field-bounded", () => {
  assert.match(route, /export async function PATCH/);
  assert.match(route, /hasDashboardAccess\(request\)[\s\S]*hasDashboardMutationOrigin\(request\)/);
  assert.match(route, /handleFinanceOverrideMutation\(request, getDb\(\)\)/);
  assert.match(writeService, /Content-Type[\s\S]*application\/json[\s\S]*status: 415/);
  assert.match(writeService, /Object\.keys\(input\)\.sort\(\)/);
  assert.match(writeService, /keys\.length !== 2[\s\S]*"id"[\s\S]*"lifeDomainOverride"/);
  assert.match(writeService, /\.set\(\{[\s\S]*lifeDomainOverride: mutation\.lifeDomainOverride,[\s\S]*updatedAt:/);
  assert.doesNotMatch(writeService, /\.set\(input\)|\.set\(payload\)|semanticNote:/);
});

test("finance audit response omits dormant relation identifiers", () => {
  const auditType = types.slice(types.indexOf("export type FinanceTransactionAuditView"), types.indexOf("export interface FinanceSourceAdapter"));
  assert.match(auditType, /id: number/);
  assert.match(auditType, /sourceId: string/);
  assert.match(auditType, /effectiveLifeDomain: LifeDomain/);
  assert.doesNotMatch(auditType, /personId|projectId|assetId|eventId|placeId/);
});
