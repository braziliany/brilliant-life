import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { QianJiExcelAdapter } from "../app/features/finance/adapters/qianji-excel.ts";
import { QianJiJsonAdapter } from "../app/features/finance/adapters/qianji-json.ts";
import {
  applyOperationsToRecords,
  applyReviewedReconciliation,
  createReconciliationManifest,
  planQianJiReconciliation,
  reconciliationPreconditionHash,
  sha256,
} from "../app/features/finance/reconciliation.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateRoot = join(projectRoot, "data", "private", "reconciliation");
const isPrivateArtifactPath = (target) => {
  const projectRelative = relative(projectRoot, target);
  if (projectRelative.startsWith("..") || isAbsolute(projectRelative)) return true;
  const privateRelative = relative(privateRoot, target);
  return !privateRelative.startsWith("..") && !isAbsolute(privateRelative);
};
const values = new Map();
const flags = new Set();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
  if (["--apply"].includes(token)) flags.add(token);
  else {
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    values.set(token, value);
    index += 1;
  }
}

const allowed = new Set(["--source", "--from", "--to", "--snapshot", "--existing", "--output", "--apply", "--manifest", "--target"]);
for (const key of [...values.keys(), ...flags]) if (!allowed.has(key)) throw new Error(`Unsupported option: ${key}`);
const source = values.get("--source");
const from = values.get("--from");
const to = values.get("--to");
const snapshotPath = values.get("--snapshot");
const existingPath = values.get("--existing");
if (source !== "qianji" || !from || !to || !snapshotPath || !existingPath) {
  console.error("用法：npm run finance:reconcile -- --source qianji --from YYYY-MM-DD --to YYYY-MM-DD --snapshot <canonical.json|xlsx> --existing <scoped-export.json> [--output <private-dir>] [--apply --manifest <reviewed.json> --target isolated]");
  process.exit(1);
}
if (values.get("--target") === "production") throw new Error("BLOCK: production reconciliation is disabled in this Sprint");

const canonicalBytes = readFileSync(resolve(snapshotPath));
const extension = extname(snapshotPath).toLowerCase();
const canonical = extension === ".xlsx"
  ? await new QianJiExcelAdapter().parse(canonicalBytes)
  : await new QianJiJsonAdapter().parse(canonicalBytes.toString("utf8"));
const existingPayload = JSON.parse(readFileSync(resolve(existingPath), "utf8"));
const existing = Array.isArray(existingPayload) ? existingPayload : existingPayload.records;
if (!Array.isArray(existing)) throw new Error("Existing scoped export must be an array or { records: [] }");

let adapterCommit = "unknown";
try {
  adapterCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim();
} catch {}
const fingerprint = {
  source: "qianji",
  from,
  to,
  filename: basename(snapshotPath),
  fileSize: statSync(resolve(snapshotPath)).size,
  sha256: sha256(canonicalBytes),
  parsedRecordCount: canonical.length,
  adapterCommit,
  generatedAt: new Date().toISOString(),
};
const plan = planQianJiReconciliation({ existing, canonical, source: "qianji", from, to });
const manifest = createReconciliationManifest(fingerprint, plan, reconciliationPreconditionHash(existing.filter((record) => record.source === "qianji" && record.occurredAt.slice(0, 10) >= from && record.occurredAt.slice(0, 10) <= to)));

if (!flags.has("--apply") || !values.get("--manifest")) {
  const outputDirectory = resolve(values.get("--output") ?? privateRoot);
  if (!isPrivateArtifactPath(outputDirectory)) throw new Error("BLOCK: reconciliation artifacts must stay outside the repository or under data/private/reconciliation");
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `${manifest.batchId}.dry-run.json`);
  writeFileSync(outputPath, JSON.stringify({ manifest, entries: plan.entries }, null, 2), "utf8");
  console.log(JSON.stringify({ mode: "DRY RUN", batchId: manifest.batchId, bucketCounts: plan.bucketCounts, output: outputPath }, null, 2));
  process.exit(0);
}

if (values.get("--target") !== "isolated") throw new Error("BLOCK: --apply requires --target isolated; production apply is disabled");
const reviewedManifest = JSON.parse(readFileSync(resolve(values.get("--manifest")), "utf8"));
let state = existing;
const checkpoint = JSON.stringify(existing, null, 2);
const store = {
  atomicity: "bounded-checkpoint",
  async loadScoped(scopedSource, scopedFrom, scopedTo) {
    return state.filter((record) => record.source === scopedSource && record.occurredAt.slice(0, 10) >= scopedFrom && record.occurredAt.slice(0, 10) <= scopedTo);
  },
  async applyOperations(operations) {
    state = applyOperationsToRecords(state, operations);
  },
};
const result = await applyReviewedReconciliation({ store, manifest: reviewedManifest, canonical, fingerprint, target: "isolated" });
const targetPath = resolve(existingPath);
if (!isPrivateArtifactPath(targetPath)) throw new Error("BLOCK: isolated apply state must stay outside the repository or under data/private/reconciliation");
const checkpointPath = `${targetPath}.${reviewedManifest.batchId}.checkpoint.json`;
const temporaryPath = `${targetPath}.reconcile.tmp`;
writeFileSync(checkpointPath, checkpoint, "utf8");
writeFileSync(temporaryPath, JSON.stringify(state, null, 2), "utf8");
renameSync(temporaryPath, targetPath);
console.log(JSON.stringify({ mode: "ISOLATED APPLY", checkpoint: checkpointPath, ...result }, null, 2));
