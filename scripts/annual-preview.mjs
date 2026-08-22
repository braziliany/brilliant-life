import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildResetSql, buildSeedSql, expectedCounts, PREVIEW_AS_OF, PREVIEW_SOURCE, PREVIEW_YEAR } from "./annual-preview-fixture.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDirectory = join(projectRoot, ".annual-preview-state");
const localPersistence = join(projectRoot, ".wrangler", "state");
const generatedConfig = join(projectRoot, "dist", "server", "wrangler.json");
const wranglerCli = join(projectRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");
const manifestPath = join(stateDirectory, "manifest.json");
const command = process.argv[2];

if (!['seed', 'reset'].includes(command) || process.argv.length !== 3) {
  console.error("用法：node scripts/annual-preview.mjs seed|reset（不接受 --remote 或其他参数）");
  process.exit(1);
}
if (!existsSync(wranglerCli)) {
  console.error("缺少本地 Wrangler，请先执行 npm install。");
  process.exit(1);
}
if (!existsSync(generatedConfig)) {
  console.error("缺少 dist/server/wrangler.json，请先执行 npm run build。");
  process.exit(1);
}
const config = JSON.parse(readFileSync(generatedConfig, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === "DB");
if (config.name !== "pulse-health-dashboard" || database?.database_name !== "pulse-health-dashboard-db") {
  console.error("本地配置校验失败，已拒绝执行预览数据操作。");
  process.exit(1);
}

mkdirSync(stateDirectory, { recursive: true });

const execute = (args) => {
  const output = execFileSync(process.execPath, [
    wranglerCli, "d1", "execute", "DB",
    "--local",
    "--persist-to", localPersistence,
    "--config", generatedConfig,
    "--json",
    ...args,
  ], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output);
};
const firstRow = (response) => response[0]?.results?.[0] ?? {};
const counts = () => firstRow(execute(["--command", "SELECT (SELECT COUNT(*) FROM health_daily) AS health, (SELECT COUNT(*) FROM salary_records) AS salary, (SELECT COUNT(*) FROM work_experiences) AS career, (SELECT COUNT(*) FROM finance_transactions) AS finance;"]));

if (command === "seed") {
  const before = counts();
  if (Object.values(before).some((value) => Number(value) !== 0)) {
    console.error(`本地 D1 不是空库，拒绝覆盖。当前记录数：${JSON.stringify(before)}。请先使用独立的空本地 D1，或在确认仅含预览数据后执行 npm run preview:reset。`);
    process.exit(1);
  }
  const sqlPath = join(stateDirectory, "seed.sql");
  writeFileSync(sqlPath, buildSeedSql(), "utf8");
  execute(["--file", sqlPath]);
  const after = counts();
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (Number(after[key]) !== expected) throw new Error(`预览数据校验失败：${key}=${after[key]}，预期 ${expected}`);
  }
  writeFileSync(manifestPath, JSON.stringify({ fixture: PREVIEW_SOURCE, year: PREVIEW_YEAR, asOf: PREVIEW_AS_OF, counts: after }, null, 2), "utf8");
  console.log(`Annual 本地预览已建立：${JSON.stringify(after)}；固定合成资料截止 ${PREVIEW_AS_OF}。`);
} else {
  if (!existsSync(manifestPath)) {
    console.error("未找到 .annual-preview-state/manifest.json，拒绝执行无法确认来源的清理。");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.fixture !== PREVIEW_SOURCE) {
    console.error("预览标记不匹配，拒绝清理。");
    process.exit(1);
  }
  const sqlPath = join(stateDirectory, "reset.sql");
  writeFileSync(sqlPath, buildResetSql(), "utf8");
  execute(["--file", sqlPath]);
  const after = counts();
  if (Object.values(after).some((value) => Number(value) !== 0)) {
    throw new Error(`reset 后本地 D1 仍有非预览数据，未继续删除：${JSON.stringify(after)}`);
  }
  rmSync(stateDirectory, { recursive: true, force: true });
  console.log("Annual 本地预览已清理，本地 D1 已恢复空状态。");
}
