import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";

import { salaryRecords } from "../db/schema.ts";
import {
  calculateSalaryRecord,
  createSalaryRecord,
  handleSalaryRecordMutation,
  readSalaryRecordInput,
  updateSalaryRecord,
} from "../app/features/salary/write-service.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const salaryRoute = readFileSync(resolve(root, "app/api/salary/route.ts"), "utf8");

const input = (overrides = {}) => ({
  month: "2026-07",
  workdays: 23,
  dailyRate: 275,
  deductions: 130,
  taxThreshold: 5000,
  taxRate: 3,
  extraIncome: 0,
  bonus: 0,
  leaveDeduction: 0,
  ...overrides,
});

async function createSalaryDb() {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const d1 = await miniflare.getD1Database("DB");
  await d1.exec(`CREATE TABLE salary_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    workdays INTEGER NOT NULL,
    daily_rate REAL NOT NULL,
    deductions REAL NOT NULL,
    tax_threshold REAL NOT NULL DEFAULT 5000,
    tax_rate REAL NOT NULL DEFAULT 3,
    extra_income REAL NOT NULL DEFAULT 0,
    bonus REAL NOT NULL DEFAULT 0,
    leave_deduction REAL NOT NULL DEFAULT 0,
    gross_salary REAL NOT NULL,
    taxable_income REAL NOT NULL,
    income_tax REAL NOT NULL,
    net_salary REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`.replace(/\s+/g, " "));
  return { miniflare, db: drizzle(d1, { schema: { salaryRecords } }) };
}

const request = (method, body, contentType = "application/json") => new Request("http://localhost/api/salary", {
  method,
  headers: { "Content-Type": contentType },
  body,
});

test("salary history payload is a strict validated allowlist", () => {
  assert.deepEqual(readSalaryRecordInput(input()), input());
  for (const value of [
    null,
    {},
    input({ month: "2026-13" }),
    input({ workdays: 1.5 }),
    input({ workdays: 32 }),
    input({ dailyRate: -1 }),
    input({ taxRate: 101 }),
    { ...input(), netSalary: 999999 },
    { ...input(), id: 1 },
  ]) assert.equal(readSalaryRecordInput(value), null);
});

test("adding a missing month uses saved inputs and duplicate months are rejected", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createSalaryDb();
  try {
    const added = await createSalaryRecord(db, input({ month: "2026-06", workdays: 21, bonus: 500 }));
    assert.equal(added.conflict, false);
    const expected = calculateSalaryRecord(input({ month: "2026-06", workdays: 21, bonus: 500 }));
    assert.deepEqual({
      grossSalary: added.record.grossSalary,
      taxableIncome: added.record.taxableIncome,
      incomeTax: added.record.incomeTax,
      netSalary: added.record.netSalary,
    }, {
      grossSalary: expected.grossSalary,
      taxableIncome: expected.taxableIncome,
      incomeTax: expected.incomeTax,
      netSalary: expected.netSalary,
    });
    assert.deepEqual(await createSalaryRecord(db, input({ month: "2026-06" })), { conflict: true });
    assert.equal((await db.select().from(salaryRecords)).length, 1);
  } finally {
    await miniflare.dispose();
  }
});

test("editing one historical snapshot recalculates it without touching other months", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createSalaryDb();
  try {
    await createSalaryRecord(db, input({ month: "2026-06", workdays: 20 }));
    await createSalaryRecord(db, input({ month: "2026-07", workdays: 23 }));
    const [juneBefore] = await db.select().from(salaryRecords).where(eq(salaryRecords.month, "2026-06"));
    const correctedInput = input({ month: "2026-07", workdays: 22, dailyRate: 280, deductions: 150, extraIncome: 120, bonus: 300, leaveDeduction: 40, taxThreshold: 5200, taxRate: 4 });
    const corrected = await updateSalaryRecord(db, correctedInput);
    const expected = calculateSalaryRecord(correctedInput);
    assert.equal(corrected.month, "2026-07");
    for (const key of ["workdays", "dailyRate", "deductions", "extraIncome", "bonus", "leaveDeduction", "taxThreshold", "taxRate", "grossSalary", "taxableIncome", "incomeTax", "netSalary"]) {
      assert.equal(corrected[key], expected[key]);
    }
    const [juneAfter] = await db.select().from(salaryRecords).where(eq(salaryRecords.month, "2026-06"));
    assert.deepEqual(juneAfter, juneBefore);
    assert.equal((await db.select().from(salaryRecords)).length, 2);
    assert.equal(await updateSalaryRecord(db, input({ month: "2026-08" })), null);
  } finally {
    await miniflare.dispose();
  }
});

test("salary mutation handler returns bounded validation, conflict, not-found, and success responses", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createSalaryDb();
  try {
    assert.equal((await handleSalaryRecordMutation(request("POST", "{}", "text/plain"), db, "create")).status, 415);
    assert.equal((await handleSalaryRecordMutation(request("POST", "{"), db, "create")).status, 400);
    assert.equal((await handleSalaryRecordMutation(request("POST", JSON.stringify({ ...input(), amount: 1 })), db, "create")).status, 400);
    const created = await handleSalaryRecordMutation(request("POST", JSON.stringify(input())), db, "create");
    assert.equal(created.status, 201);
    assert.equal((await created.json()).record.month, "2026-07");
    assert.equal((await handleSalaryRecordMutation(request("POST", JSON.stringify(input())), db, "create")).status, 409);
    assert.equal((await handleSalaryRecordMutation(request("PUT", JSON.stringify(input({ month: "2026-08" }))), db, "update")).status, 404);
    const updated = await handleSalaryRecordMutation(request("PUT", JSON.stringify(input({ workdays: 22 }))), db, "update");
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).record.workdays, 22);
    const failed = await handleSalaryRecordMutation(request("PUT", JSON.stringify(input())), { select() { throw new Error("private D1 detail"); } }, "update");
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "Salary update failed" });
  } finally {
    await miniflare.dispose();
  }
});

test("the existing current-month quick save still upserts with the server policy", { timeout: 30_000 }, async () => {
  const { miniflare, db } = await createSalaryDb();
  const policy = { dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 3, extraIncome: 0, bonus: 0, leaveDeduction: 0 };
  try {
    const first = await handleSalaryRecordMutation(request("PUT", JSON.stringify({ month: "2026-09", workdays: 20 })), db, "update", policy);
    assert.equal(first.status, 200);
    const second = await handleSalaryRecordMutation(request("PUT", JSON.stringify({ month: "2026-09", workdays: 21 })), db, "update", policy);
    assert.equal(second.status, 200);
    const rows = await db.select().from(salaryRecords);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].workdays, 21);
    assert.equal(rows[0].netSalary, calculateSalaryRecord(input({ month: "2026-09", workdays: 21 })).netSalary);
  } finally {
    await miniflare.dispose();
  }
});

test("salary route preserves reads and protects POST and PUT with access and same-origin gates", () => {
  assert.match(salaryRoute, /export async function GET/);
  assert.match(salaryRoute, /export async function PUT[\s\S]*hasDashboardAccess\(request\)[\s\S]*hasDashboardMutationOrigin\(request\)[\s\S]*handleSalaryRecordMutation/);
  assert.match(salaryRoute, /export async function POST[\s\S]*hasDashboardAccess\(request\)[\s\S]*hasDashboardMutationOrigin\(request\)[\s\S]*handleSalaryRecordMutation/);
  assert.doesNotMatch(salaryRoute, /export async function DELETE|export async function PATCH/);
});
