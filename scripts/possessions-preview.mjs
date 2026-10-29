import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately no remote mode, reset, production credentials or arbitrary paths.
const command = process.argv[2];
if (process.argv.length !== 3 || !["seed", "serve"].includes(command)) {
  console.error("用法：node scripts/possessions-preview.mjs seed|serve（只支持隔离本地预览）"); process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = join(root, ".wrangler", "possessions-preview");
const persistence = join(stateRoot, "state");
const generated = join(root, "dist", "server", "wrangler.json");
const cli = join(root, "node_modules", "wrangler", "wrangler-dist", "cli.js");
if (!existsSync(generated)) throw new Error("请先使用 Node 22 执行 npm run build。");
const built = JSON.parse(readFileSync(generated, "utf8"));
mkdirSync(stateRoot, { recursive: true });
const config = join(stateRoot, "wrangler.json");
writeFileSync(config, JSON.stringify({
  name: "pulse-possessions-local", main: resolve(dirname(generated), built.main),
  compatibility_date: built.compatibility_date, compatibility_flags: built.compatibility_flags,
  no_bundle: true, rules: built.rules,
  workers_dev: false, preview_urls: false,
  assets: { ...built.assets, directory: resolve(dirname(generated), built.assets.directory) },
  d1_databases: [{ binding: "DB", database_name: "pulse-possessions-local", database_id: "00000000-0000-4000-8000-000000000000" }],
}, null, 2));
const environment = { ...process.env, XDG_CONFIG_HOME: join(stateRoot, "xdg"), WRANGLER_SEND_METRICS: "false", WRANGLER_HIDE_BANNER: "true", WRANGLER_WRITE_LOGS: "false" };
mkdirSync(environment.XDG_CONFIG_HOME, { recursive: true });
if (command === "seed") {
  if (existsSync(persistence) || existsSync(join(stateRoot, "manifest.json"))) throw new Error("预览库已存在，拒绝重置或覆盖已有记录。");
  const sql = readdirSync(join(root, "drizzle")).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort().map(name => readFileSync(join(root, "drizzle", name), "utf8")).join("\n");
  const sample = `
INSERT INTO possession_wishes(id,name,budget_cents,planned_date,notes,status) VALUES
 (1,'合成·想买的台灯',35000,'2026-12-01','仅本地验收，不是真实购买计划。','wanted'),
 (2,'合成·已购买待转入',15000,NULL,'可用于体验显式转入，实际成交价默认未知。','purchased'),
 (3,'合成·取消的愿望',NULL,NULL,'取消仍保留历史。','cancelled');
INSERT INTO possession_items(id,name,category,brand_model,purchase_date,purchase_price_cents,notes,status,ended_date) VALUES
 (1,'合成·随身耳机','数码','验收样例','2026-10-01',19900,'仅本地合成记录，包含多次使用。','in_use',NULL),
 (2,'合成·随身水杯','日常',NULL,NULL,0,'明确零元，购买日期未知。','idle',NULL),
 (3,'合成·旧背包','日常',NULL,'2024-01-01',NULL,'未知价格，持有天数截止于转赠日。','gifted','2026-09-30');
INSERT INTO possession_uses(item_id,used_on,count,note) VALUES
 (1,'2026-10-01',1,'合成首次使用'),(1,'2026-10-25',2,'合成历史补记'),(2,'2026-10-20',1,'合成使用记录');
`;
  const sqlFile = join(stateRoot, "seed.sql"); writeFileSync(sqlFile, sql + "\n" + sample);
  execFileSync(process.execPath, [cli, "d1", "execute", "DB", "--local", "--persist-to", persistence, "--config", config, "--file", sqlFile], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const counts = JSON.parse(execFileSync(process.execPath, [cli, "d1", "execute", "DB", "--local", "--persist-to", persistence, "--config", config, "--json", "--command", "SELECT (SELECT COUNT(*) FROM possession_items) AS items,(SELECT COUNT(*) FROM possession_uses) AS uses,(SELECT COUNT(*) FROM possession_wishes) AS wishes;"], { cwd: root, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))[0].results[0];
  if (counts.items !== 3 || counts.uses !== 3 || counts.wishes !== 3) throw new Error("本地合成数据核验失败。");
  writeFileSync(join(stateRoot, "manifest.json"), JSON.stringify({ fixture: "possessions-phase1-local-only", counts }, null, 2));
  console.log(`隔离本地验收库已建立：${JSON.stringify(counts)}。未连接生产，已存在的库不会被覆盖。`);
} else {
  if (!existsSync(join(stateRoot, "manifest.json"))) throw new Error("请先执行 npm run preview:possessions:seed。");
  console.log("仅本地预览，监听 0.0.0.0:4186；验收通过后关闭此服务。");
  const child = spawnSync(process.execPath, [cli, "dev", "--config", config, "--local", "--persist-to", persistence, "--ip", "0.0.0.0", "--port", "4186", "--inspector-port", "9286", "--show-interactive-dev-session=false"], { cwd: root, env: environment, stdio: "inherit" });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}
