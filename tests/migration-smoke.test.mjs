import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const migrationsDirectory = join(projectRoot, "drizzle");
const wranglerCli = join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

const createHarness = (name) => {
  const root = mkdtempSync(join(tmpdir(), `brilliant-life-${name}-`));
  const persistence = join(root, "persistence");
  const xdg = join(root, "xdg");
  mkdirSync(persistence);
  mkdirSync(xdg);
  const config = join(root, "wrangler.json");
  const worker = join(root, "worker.js");
  writeFileSync(worker, "export default { fetch: () => new Response('ok') };\n");
  writeFileSync(config, JSON.stringify({
    name: `brilliant-life-${name}`,
    main: worker,
    compatibility_date: "2026-08-09",
    d1_databases: [{
      binding: "DB",
      database_name: `brilliant-life-${name}`,
      database_id: "00000000-0000-4000-8000-000000000000",
    }],
  }));

  const execute = (...arguments_) => {
    const output = execFileSync(process.execPath, [
      wranglerCli,
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      persistence,
      "--config",
      config,
      "--json",
      ...arguments_,
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, XDG_CONFIG_HOME: xdg },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  };

  return { root, execute };
};

const combineMigrations = (root, name, files, suffix = "") => {
  const target = join(root, name);
  const sql = files
    .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
    .join("\n--> statement-breakpoint\n");
  writeFileSync(target, `${sql}\n${suffix}`);
  return target;
};

const firstResults = (response) => response[0]?.results ?? [];

test("an empty local D1 applies every migration in order", { timeout: 120_000 }, () => {
  const harness = createHarness("empty");
  try {
    const allMigrations = combineMigrations(harness.root, "all.sql", migrationFiles);
    harness.execute("--file", allMigrations);

    const tables = firstResults(harness.execute("--command", "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('health_daily','health_ingestion_runs','calendar_overrides','calendar_notes','salary_records','salary_settings','work_experiences','finance_transactions') ORDER BY name;"));
    assert.deepEqual(tables.map(({ name }) => name), [
      "calendar_notes",
      "calendar_overrides",
      "finance_transactions",
      "health_daily",
      "health_ingestion_runs",
      "salary_records",
      "salary_settings",
      "work_experiences",
    ]);

    const financeColumns = firstResults(harness.execute("--command", "SELECT name FROM pragma_table_info('finance_transactions') ORDER BY cid;"));
    assert.deepEqual(financeColumns.map(({ name }) => name).slice(0, 8), ["id", "source", "source_id", "occurred_at", "type", "amount_cents", "currency", "raw_type"]);
    const financeIndexes = firstResults(harness.execute("--command", "SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'finance_transactions' ORDER BY name;"));
    assert.ok(financeIndexes.some(({ name }) => name === "finance_transactions_source_source_id_unique"));

    harness.execute("--command", "INSERT INTO finance_transactions (source, source_id, occurred_at, type, amount_cents, raw_category, life_domain, person_id, project_id, asset_id, event_id, place_id, semantic_note) VALUES ('qianji','qj-fixture-1','2026-08-11T12:00:00+08:00','expense',13609,'三餐','food',1,2,3,4,5,'人工说明') ON CONFLICT(source, source_id) DO UPDATE SET amount_cents=excluded.amount_cents, raw_category=excluded.raw_category, life_domain=excluded.life_domain, updated_at=CURRENT_TIMESTAMP;");
    harness.execute("--command", "INSERT INTO finance_transactions (source, source_id, occurred_at, type, amount_cents, raw_category, life_domain) VALUES ('qianji','qj-fixture-1','2026-08-11T12:00:00+08:00','expense',15000,'三餐','food') ON CONFLICT(source, source_id) DO UPDATE SET amount_cents=excluded.amount_cents, raw_category=excluded.raw_category, life_domain=excluded.life_domain, updated_at=CURRENT_TIMESTAMP;");
    const financeRows = firstResults(harness.execute("--command", "SELECT COUNT(*) AS count, amount_cents, person_id, project_id, asset_id, event_id, place_id, semantic_note FROM finance_transactions WHERE source='qianji' AND source_id='qj-fixture-1';"));
    assert.deepEqual(financeRows, [{ count: 1, amount_cents: 15000, person_id: 1, project_id: 2, asset_id: 3, event_id: 4, place_id: 5, semantic_note: "人工说明" }]);

    const healthColumns = firstResults(harness.execute("--command", "SELECT name FROM pragma_table_info('health_daily') ORDER BY cid;"));
    assert.deepEqual(healthColumns.map(({ name }) => name).slice(-5), [
      "resting_energy_kcal",
      "weight_kg",
      "sleep_minutes",
      "resting_heart_rate_bpm",
      "metric_coverage",
    ]);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test("a populated intermediate local D1 upgrades without changing synthetic records", { timeout: 120_000 }, () => {
  const harness = createHarness("intermediate");
  try {
    const splitIndex = migrationFiles.indexOf("0009_handy_justice.sql");
    assert.ok(splitIndex > 0, "expected the weight migration boundary");
    const syntheticData = `
INSERT INTO health_daily (date, steps, active_energy_kcal, exercise_minutes, workout_count, source, resting_energy_kcal) VALUES ('2026-07-25', 885, 804, 16, 0, 'synthetic-test', 1755);
INSERT INTO salary_records (month, workdays, daily_rate, deductions, gross_salary, taxable_income, income_tax, net_salary, extra_income, bonus, leave_deduction, tax_threshold, tax_rate) VALUES ('2026-07', 23, 275, 130, 6325, 1195, 35.85, 6159.15, 0, 0, 0, 5000, 3);
INSERT INTO calendar_overrides (date, is_workday) VALUES ('2026-07-05', 1);
INSERT INTO work_experiences (company, role, start_date, summary, sort_order) VALUES ('合成公司', '测试岗位', '2026-01', '仅用于迁移测试', 1);
`;
    const before = combineMigrations(harness.root, "before.sql", migrationFiles.slice(0, splitIndex), syntheticData);
    const after = combineMigrations(harness.root, "after.sql", migrationFiles.slice(splitIndex));
    harness.execute("--file", before);
    harness.execute("--file", after);

    harness.execute("--command", "INSERT INTO health_daily (date, steps, active_energy_kcal, exercise_minutes, workout_count, source, resting_energy_kcal) VALUES ('2026-07-26', 0, 0, 0, 0, 'old-worker-shape', 0);");

    const health = firstResults(harness.execute("--command", "SELECT date, steps, active_energy_kcal, resting_energy_kcal, weight_kg, sleep_minutes, resting_heart_rate_bpm, metric_coverage, source FROM health_daily ORDER BY date;"));
    assert.deepEqual(health, [{
      date: "2026-07-25",
      steps: 885,
      active_energy_kcal: 804,
      resting_energy_kcal: 1755,
      weight_kg: null,
      sleep_minutes: null,
      resting_heart_rate_bpm: null,
      metric_coverage: null,
      source: "synthetic-test",
    }, {
      date: "2026-07-26",
      steps: 0,
      active_energy_kcal: 0,
      resting_energy_kcal: 0,
      weight_kg: null,
      sleep_minutes: null,
      resting_heart_rate_bpm: null,
      metric_coverage: null,
      source: "old-worker-shape",
    }]);

    const salary = firstResults(harness.execute("--command", "SELECT month, workdays, gross_salary, income_tax, net_salary FROM salary_records;"));
    assert.deepEqual(salary, [{ month: "2026-07", workdays: 23, gross_salary: 6325, income_tax: 35.85, net_salary: 6159.15 }]);
    const supportingRows = firstResults(harness.execute("--command", "SELECT (SELECT COUNT(*) FROM calendar_overrides) AS calendar_rows, (SELECT COUNT(*) FROM work_experiences) AS career_rows, (SELECT COUNT(*) FROM health_ingestion_runs) AS ingestion_rows;"));
    assert.deepEqual(supportingRows, [{ calendar_rows: 1, career_rows: 1, ingestion_rows: 0 }]);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});
