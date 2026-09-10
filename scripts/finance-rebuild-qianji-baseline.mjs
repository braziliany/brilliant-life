import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

import { getPlatformProxy } from "wrangler";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import {
  QIANJI_BASELINE_REBUILD_CONTRACT,
  runQianJiBaselineRebuild,
  validateQianJiBaselineCanonical,
} from "./qianji-baseline-rebuild.ts";

const args = process.argv.slice(2);
const values = new Map();
const flags = new Set();
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (!argument.startsWith("--")) continue;
  const following = args[index + 1];
  if (following && !following.startsWith("--")) {
    values.set(argument, following);
    index += 1;
  } else {
    flags.add(argument);
  }
}

const snapshotPath = values.get("--snapshot");
if (!snapshotPath) throw new Error("BLOCK: --snapshot is required");
const absoluteSnapshot = resolve(snapshotPath);
if (extname(absoluteSnapshot).toLowerCase() !== ".xlsx") throw new Error("BLOCK: the locked canonical must be an XLSX file");
const bytes = await readFile(absoluteSnapshot);
const validation = await new QianJiExcelAdapter().inspect(bytes);
const canonical = validateQianJiBaselineCanonical(bytes, validation);

const interlocks = {
  apply: flags.has("--apply"),
  target: values.get("--target"),
  confirm: flags.has("--confirm-qianji-baseline-rebuild"),
};
const allApplyInterlocks = interlocks.apply && interlocks.target === "production" && interlocks.confirm;
const anyApplyInterlock = interlocks.apply || interlocks.target === "production" || interlocks.confirm;
if (!allApplyInterlocks && anyApplyInterlock && interlocks.target !== "production") {
  throw new Error("BLOCK: production execution requires --apply --target production --confirm-qianji-baseline-rebuild");
}

if (interlocks.target !== "production") {
  console.log(JSON.stringify({
    mode: "LOCAL PREFLIGHT",
    wrote: false,
    canonical: {
      filename: basename(absoluteSnapshot),
      records: canonical.snapshot.records,
      sourceIdSetHash: canonical.snapshot.sourceIdSetHash,
    },
    next: "Use --target production without --apply for a production read-only preflight.",
  }, null, 2));
  process.exit(0);
}

const configPath = resolve("scripts/qianji-baseline-rebuild.wrangler.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const binding = config.d1_databases?.find((item) => item.binding === "DB");
if (binding?.database_name !== QIANJI_BASELINE_REBUILD_CONTRACT.databaseName
  || binding?.database_id !== QIANJI_BASELINE_REBUILD_CONTRACT.databaseId
  || binding?.remote !== true) {
  throw new Error("BLOCK: configured D1 database identity differs");
}

const proxy = await getPlatformProxy({ configPath, persist: false, remoteBindings: true });
try {
  const result = await runQianJiBaselineRebuild({ database: proxy.env.DB, canonical: canonical.transactions, interlocks });
  if (result.mode === "APPLIED") {
    const auditDirectory = resolve("data/private/reconciliation");
    await mkdir(auditDirectory, { recursive: true });
    const auditPath = resolve(auditDirectory, "qianji-2026-01-01_2026-08-31-baseline-rebuild.json");
    await writeFile(auditPath, JSON.stringify({
      canonicalSha256: QIANJI_BASELINE_REBUILD_CONTRACT.canonicalSha256,
      preconditionHash: result.preconditionHash,
      deletedRows: result.deleteCount,
      insertedRows: result.insertCount,
      postStateHashes: { sourceIdSetHash: result.after?.sourceIdSetHash, rowProjectionHash: result.after?.rowProjectionHash },
      postStateTotals: result.after,
      database: { name: QIANJI_BASELINE_REBUILD_CONTRACT.databaseName, id: QIANJI_BASELINE_REBUILD_CONTRACT.databaseId },
      timestamp: result.timestamp,
      result: "success",
    }, null, 2), "utf8");
    console.log(JSON.stringify({ ...result, auditPath }, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await proxy.dispose();
}
