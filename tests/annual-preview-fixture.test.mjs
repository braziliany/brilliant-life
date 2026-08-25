import assert from "node:assert/strict";
import test from "node:test";
import { buildResetSql, buildSeedSql, careerRows, expectedCounts, financeRows, healthRows, PREVIEW_AS_OF, PREVIEW_SOURCE, salaryRows } from "../scripts/annual-preview-fixture.mjs";

test("annual preview fixture is synthetic and covers every requested domain", () => {
  assert.equal(PREVIEW_AS_OF, "2026-08-22");
  assert.equal(expectedCounts.health, 8);
  assert.equal(expectedCounts.salary, 2);
  assert.equal(expectedCounts.career, 2);
  assert.equal(expectedCounts.finance, 21);
  assert.ok(healthRows.some((row) => row[9] === null), "legacy unknown health row");
  assert.ok(healthRows.some((row) => Array.isArray(row[9]) && row[9].length === 0), "confirmed missing health row");
  assert.ok(healthRows.some((row) => row[1] === 0 && row[9]?.includes("steps")), "explicit zero steps row");
  assert.ok(healthRows.some((row) => row[6] && row[7] && row[8]), "weight, sleep, and resting heart rate");
  assert.ok(healthRows.filter((row) => [0, 6].includes(new Date(`${row[0]}T00:00:00Z`).getUTCDay())).length >= 3, "non-workday health samples");
  assert.ok(healthRows.filter((row) => ![0, 6].includes(new Date(`${row[0]}T00:00:00Z`).getUTCDay())).length >= 3, "workday health samples");
  assert.ok(careerRows.some((row) => row[2] < "2026-01" && row[3]?.startsWith("2026-")));
  assert.ok(careerRows.some((row) => row[3] === null));
  assert.deepEqual(new Set(financeRows.map((row) => row[2])), new Set(["income", "expense", "refund", "transfer", "repayment"]));
  assert.deepEqual(new Set(financeRows.map((row) => row[1].slice(0, 7))).size, 8);
  assert.ok(financeRows.filter((row) => row[2] === "expense" && row[3] >= 50_000).length >= 5);
  assert.ok(financeRows.some((row) => row[7] && row[5] !== row[7]), "manual life domain override");
  assert.ok(financeRows.some((row) => !row[7]), "automatic life domain without override");
  assert.ok(financeRows.every((row) => row[1].slice(0, 10) <= PREVIEW_AS_OF));
  assert.ok(salaryRows.every((row) => ![5625.65, 5892.4, 6159.15].includes(row[7])));
  const serialized = JSON.stringify({ healthRows, salaryRows, careerRows, financeRows });
  for (const forbidden of ["43359.28", "33179.01", "11541.37", "21637.64", "钱迹", "博士电动工具", "星源新材料"]) {
    assert.equal(serialized.includes(forbidden), false, `fixture must not include ${forbidden}`);
  }
});

test("annual preview SQL is scoped to its synthetic source", () => {
  const seed = buildSeedSql();
  const reset = buildResetSql();
  assert.ok(seed.includes(PREVIEW_SOURCE));
  assert.ok(reset.includes(`source = '${PREVIEW_SOURCE}'`));
  assert.equal(seed.includes("--remote"), false);
  assert.equal(reset.includes("--remote"), false);
});
