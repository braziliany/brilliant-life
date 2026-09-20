import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import {
  QIANJI_BASELINE_REBUILD_CONTRACT,
  createQianJiBaselineExecutionAsset,
  validateQianJiBaselineCanonical,
} from "./qianji-baseline-rebuild.ts";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const snapshotPath = value("--snapshot");
if (!snapshotPath) throw new Error("BLOCK: --snapshot is required");
const absoluteSnapshot = resolve(snapshotPath);
if (extname(absoluteSnapshot).toLowerCase() !== ".xlsx") throw new Error("BLOCK: the locked canonical must be an XLSX file");
const outputPath = resolve(value("--output") ?? "data/private/reconciliation/qianji-2026-01-01_2026-08-31-worker-asset.json");

const bytes = await readFile(absoluteSnapshot);
const validation = await new QianJiExcelAdapter().inspect(bytes);
const canonical = validateQianJiBaselineCanonical(bytes, validation);
const asset = createQianJiBaselineExecutionAsset(canonical.transactions);
if (asset.executionAssetSha256 !== QIANJI_BASELINE_REBUILD_CONTRACT.executionAssetSha256) throw new Error("BLOCK: execution asset SHA-256 differs");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(asset), "utf8");
console.log(JSON.stringify({
  outputPath,
  records: asset.payload.records,
  canonicalSha256: asset.payload.canonicalSha256,
  sourceIdSetHash: asset.payload.sourceIdSetHash,
  executionAssetSha256: asset.executionAssetSha256,
}, null, 2));
