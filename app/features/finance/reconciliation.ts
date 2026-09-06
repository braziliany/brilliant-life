import { createHash } from "node:crypto";
import { changedFinanceSourceFields, financeSourceFactProjection, isGeneratedFinanceSourceId, sameFinanceSourceFacts, type FinanceSourceFactField } from "./source-facts.ts";
import { effectiveLifeDomain } from "./domain.ts";
import { isLifeDomain, type FinanceTransactionRecord, type NormalizedFinanceTransaction } from "./types.ts";

export const RECONCILIATION_BUCKETS = [
  "UNCHANGED",
  "UPDATE",
  "INSERT",
  "MISSING_IN_CANONICAL",
  "POSSIBLE_REKEY",
  "POSSIBLE_DUPLICATE",
  "AMBIGUOUS",
  "INVALID_CANONICAL",
  "OUT_OF_SCOPE",
] as const;
export type ReconciliationBucket = typeof RECONCILIATION_BUCKETS[number];

export const RECONCILIATION_ACTIONS = ["KEEP", "UPDATE", "INSERT", "REKEY", "DELETE"] as const;
export type ReconciliationAction = typeof RECONCILIATION_ACTIONS[number];

export type ReconciliationStoredRecord = FinanceTransactionRecord & {
  createdAt?: string;
  updatedAt?: string;
};

export type ManualSemanticAssets = {
  lifeDomainOverride: boolean;
  semanticNote: boolean;
  personId: boolean;
  projectId: boolean;
  assetId: boolean;
  eventId: boolean;
  placeId: boolean;
  any: boolean;
};

export type ReconciliationEntry = {
  bucket: ReconciliationBucket;
  oldTransactionId?: number;
  oldSourceId?: string;
  canonicalSourceId?: string;
  sourceIdGenerated: boolean;
  changedFields: FinanceSourceFactField[];
  candidateLevel?: "HIGH_CANDIDATE" | "MEDIUM_CANDIDATE" | "AMBIGUOUS";
  reasons: string[];
  manualAssets?: ManualSemanticAssets;
};

export type ReconciliationPlan = {
  source: "qianji";
  from: string;
  to: string;
  entries: ReconciliationEntry[];
  bucketCounts: Record<ReconciliationBucket, number>;
};

export type CanonicalFingerprint = {
  source: "qianji";
  from: string;
  to: string;
  filename: string;
  fileSize: number;
  sha256: string;
  parsedRecordCount: number;
  adapterCommit: string;
  generatedAt: string;
};

export type ReconciliationResolution = {
  action: ReconciliationAction;
  oldTransactionId: number | null;
  oldSourceId: string | null;
  canonicalSourceId: string | null;
  reason: string;
  reviewed: boolean;
};

export type ReconciliationManifest = Omit<CanonicalFingerprint, "sha256"> & {
  batchId: string;
  snapshotSha256: string;
  preconditionHash: string;
  bucketCounts: Record<ReconciliationBucket, number>;
  resolutions: ReconciliationResolution[];
};

export type ReconciliationOperation =
  | { action: "UPDATE"; oldTransactionId: number; expectedOldSourceId: string; canonical: NormalizedFinanceTransaction }
  | { action: "INSERT"; canonical: NormalizedFinanceTransaction }
  | { action: "REKEY"; oldTransactionId: number; expectedOldSourceId: string; canonical: NormalizedFinanceTransaction }
  | { action: "DELETE"; oldTransactionId: number; expectedOldSourceId: string };

export type ReconciliationStore = {
  atomicity: "transactional-batch" | "bounded-checkpoint";
  loadScoped(source: "qianji", from: string, to: string): Promise<ReconciliationStoredRecord[]>;
  applyOperations(operations: ReconciliationOperation[]): Promise<void>;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const identity = (value: { source: string; sourceId: string }) => `${value.source}:${value.sourceId}`;
const inScope = (value: { source: string; occurredAt: string }, source: string, from: string, to: string) =>
  value.source === source && value.occurredAt.slice(0, 10) >= from && value.occurredAt.slice(0, 10) <= to;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function manualSemanticAssets(record: ReconciliationStoredRecord): ManualSemanticAssets {
  const result = {
    lifeDomainOverride: record.lifeDomainOverride !== null,
    semanticNote: record.semanticNote.trim() !== "",
    personId: record.personId !== null,
    projectId: record.projectId !== null,
    assetId: record.assetId !== null,
    eventId: record.eventId !== null,
    placeId: record.placeId !== null,
  };
  return { ...result, any: Object.values(result).some(Boolean) };
}

function combineManualSemanticAssets(records: ReconciliationStoredRecord[]): ManualSemanticAssets {
  const values = records.map(manualSemanticAssets);
  const result = {
    lifeDomainOverride: values.some((value) => value.lifeDomainOverride),
    semanticNote: values.some((value) => value.semanticNote),
    personId: values.some((value) => value.personId),
    projectId: values.some((value) => value.projectId),
    assetId: values.some((value) => value.assetId),
    eventId: values.some((value) => value.eventId),
    placeId: values.some((value) => value.placeId),
  };
  return { ...result, any: Object.values(result).some(Boolean) };
}

function validCanonical(item: unknown): item is NormalizedFinanceTransaction {
  if (!item || typeof item !== "object") return false;
  const value = item as NormalizedFinanceTransaction;
  return value.source === "qianji"
    && typeof value.sourceId === "string" && value.sourceId.length > 0
    && typeof value.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value.occurredAt)
    && ["expense", "income", "refund", "transfer", "repayment"].includes(value.type)
    && Number.isSafeInteger(value.amountCents) && value.amountCents >= 0
    && typeof value.currency === "string"
    && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")
    && isLifeDomain(value.lifeDomain);
}

function sameInstant(left: string, right: string) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function candidateEvidence(oldRecord: ReconciliationStoredRecord, canonical: NormalizedFinanceTransaction) {
  if (oldRecord.type !== canonical.type) return null;
  const instant = sameInstant(oldRecord.occurredAt, canonical.occurredAt);
  const sameDay = oldRecord.occurredAt.slice(0, 10) === canonical.occurredAt.slice(0, 10);
  if (!instant && !sameDay) return null;
  const amount = oldRecord.amountCents === canonical.amountCents;
  const note = !!oldRecord.note && oldRecord.note === canonical.note;
  const account = (!!oldRecord.accountFrom && oldRecord.accountFrom === canonical.accountFrom)
    || (!!oldRecord.accountTo && oldRecord.accountTo === canonical.accountTo);
  const category = oldRecord.rawCategory === canonical.rawCategory && oldRecord.rawSubcategory === canonical.rawSubcategory;
  const supporting = [amount, note, account, category].filter(Boolean).length;
  if (supporting < 1) return null;
  const reasons = ["same transaction type", instant ? "same instant after timezone normalization" : "same local date"];
  if (amount) reasons.push("same amount");
  if (note) reasons.push("same note/title");
  if (account) reasons.push("overlapping account");
  if (category) reasons.push("same raw category");
  return { level: (instant && supporting >= 3 ? "HIGH_CANDIDATE" : "MEDIUM_CANDIDATE") as "HIGH_CANDIDATE" | "MEDIUM_CANDIDATE", supporting, reasons };
}

function emptyCounts(): Record<ReconciliationBucket, number> {
  return Object.fromEntries(RECONCILIATION_BUCKETS.map((bucket) => [bucket, 0])) as Record<ReconciliationBucket, number>;
}

export function planQianJiReconciliation(input: {
  existing: ReconciliationStoredRecord[];
  canonical: NormalizedFinanceTransaction[];
  source: "qianji";
  from: string;
  to: string;
}): ReconciliationPlan {
  if (!datePattern.test(input.from) || !datePattern.test(input.to) || input.from > input.to) throw new Error("Invalid reconciliation range");
  const entries: ReconciliationEntry[] = [];
  const existing = input.existing.filter((item) => inScope(item, input.source, input.from, input.to));
  for (const item of input.existing.filter((record) => !inScope(record, input.source, input.from, input.to))) {
    entries.push({ bucket: "OUT_OF_SCOPE", oldTransactionId: item.id, oldSourceId: item.sourceId, sourceIdGenerated: isGeneratedFinanceSourceId(item.sourceId), changedFields: [], reasons: [item.source !== input.source ? "source is not qianji" : "occurredAt is outside confirmed range"], manualAssets: manualSemanticAssets(item) });
  }

  const duplicateCanonical = new Map<string, number>();
  for (const item of input.canonical) duplicateCanonical.set(identity(item), (duplicateCanonical.get(identity(item)) ?? 0) + 1);
  const usableCanonical: NormalizedFinanceTransaction[] = [];
  for (const item of input.canonical) {
    if (!validCanonical(item)) {
      entries.push({ bucket: "INVALID_CANONICAL", canonicalSourceId: typeof item?.sourceId === "string" ? item.sourceId : undefined, sourceIdGenerated: typeof item?.sourceId === "string" && isGeneratedFinanceSourceId(item.sourceId), changedFields: [], reasons: ["record failed normalized transaction validation"] });
    } else if (!inScope(item, input.source, input.from, input.to)) {
      entries.push({ bucket: "OUT_OF_SCOPE", canonicalSourceId: item.sourceId, sourceIdGenerated: isGeneratedFinanceSourceId(item.sourceId), changedFields: [], reasons: [item.source !== input.source ? "source is not qianji" : "occurredAt is outside confirmed range"] });
    } else if ((duplicateCanonical.get(identity(item)) ?? 0) > 1) {
      entries.push({ bucket: "INVALID_CANONICAL", canonicalSourceId: item.sourceId, sourceIdGenerated: isGeneratedFinanceSourceId(item.sourceId), changedFields: [], reasons: ["duplicate source + sourceId inside canonical snapshot"] });
    } else {
      usableCanonical.push(item);
    }
  }

  const oldByIdentity = new Map(existing.map((item) => [identity(item), item]));
  const matchedOld = new Set<number>();
  const unmatchedCanonical: NormalizedFinanceTransaction[] = [];
  for (const item of usableCanonical) {
    const oldRecord = oldByIdentity.get(identity(item));
    if (!oldRecord) {
      unmatchedCanonical.push(item);
      continue;
    }
    matchedOld.add(oldRecord.id);
    const changedFields = changedFinanceSourceFields(oldRecord, item);
    entries.push({
      bucket: changedFields.length ? "UPDATE" : "UNCHANGED",
      oldTransactionId: oldRecord.id,
      oldSourceId: oldRecord.sourceId,
      canonicalSourceId: item.sourceId,
      sourceIdGenerated: isGeneratedFinanceSourceId(item.sourceId),
      changedFields,
      reasons: changedFields.length ? [`same identity; changed: ${changedFields.join(", ")}`] : ["same identity and source facts"],
      manualAssets: manualSemanticAssets(oldRecord),
    });
  }

  const unmatchedOld = existing.filter((item) => !matchedOld.has(item.id));
  const oldEdges = new Map<number, Array<{ canonical: NormalizedFinanceTransaction; evidence: NonNullable<ReturnType<typeof candidateEvidence>> }>>();
  const newEdges = new Map<string, Array<{ oldRecord: ReconciliationStoredRecord; evidence: NonNullable<ReturnType<typeof candidateEvidence>> }>>();
  for (const canonical of unmatchedCanonical) {
    for (const oldRecord of unmatchedOld) {
      const evidence = candidateEvidence(oldRecord, canonical);
      if (!evidence) continue;
      const oldList = oldEdges.get(oldRecord.id) ?? [];
      oldList.push({ canonical, evidence });
      oldEdges.set(oldRecord.id, oldList);
      const newList = newEdges.get(canonical.sourceId) ?? [];
      newList.push({ oldRecord, evidence });
      newEdges.set(canonical.sourceId, newList);
    }
  }

  const consumedOld = new Set<number>();
  const consumedNew = new Set<string>();
  for (const canonical of unmatchedCanonical) {
    const candidates = newEdges.get(canonical.sourceId) ?? [];
    if (candidates.length === 0) continue;
    if (candidates.length === 1 && (oldEdges.get(candidates[0].oldRecord.id)?.length ?? 0) === 1) {
      const { oldRecord, evidence } = candidates[0];
      const duplicate = sameFinanceSourceFacts(oldRecord, canonical);
      entries.push({
        bucket: duplicate ? "POSSIBLE_DUPLICATE" : "POSSIBLE_REKEY",
        oldTransactionId: oldRecord.id,
        oldSourceId: oldRecord.sourceId,
        canonicalSourceId: canonical.sourceId,
        sourceIdGenerated: isGeneratedFinanceSourceId(oldRecord.sourceId) || isGeneratedFinanceSourceId(canonical.sourceId),
        changedFields: changedFinanceSourceFields(oldRecord, canonical),
        candidateLevel: evidence.level,
        reasons: [...evidence.reasons, duplicate ? "all source facts match but identity differs" : "identity differs; manual review required"],
        manualAssets: manualSemanticAssets(oldRecord),
      });
      consumedOld.add(oldRecord.id);
      consumedNew.add(canonical.sourceId);
    } else {
      entries.push({
        bucket: "AMBIGUOUS",
        canonicalSourceId: canonical.sourceId,
        sourceIdGenerated: isGeneratedFinanceSourceId(canonical.sourceId),
        changedFields: [],
        candidateLevel: "AMBIGUOUS",
        reasons: [`${candidates.length} plausible old candidates; no automatic choice`, ...(candidates.some(({ oldRecord }) => manualSemanticAssets(oldRecord).any) ? ["one or more candidates carry manual semantic assets"] : [])],
        manualAssets: combineManualSemanticAssets(candidates.map(({ oldRecord }) => oldRecord)),
      });
      consumedNew.add(canonical.sourceId);
      for (const candidate of candidates) consumedOld.add(candidate.oldRecord.id);
    }
  }

  for (const item of unmatchedCanonical.filter((canonical) => !consumedNew.has(canonical.sourceId))) {
    entries.push({ bucket: "INSERT", canonicalSourceId: item.sourceId, sourceIdGenerated: isGeneratedFinanceSourceId(item.sourceId), changedFields: [], reasons: ["no exact identity or reasonable old candidate"] });
  }
  for (const item of unmatchedOld.filter((oldRecord) => !consumedOld.has(oldRecord.id))) {
    const assets = manualSemanticAssets(item);
    entries.push({ bucket: "MISSING_IN_CANONICAL", oldTransactionId: item.id, oldSourceId: item.sourceId, sourceIdGenerated: isGeneratedFinanceSourceId(item.sourceId), changedFields: [], reasons: [assets.any ? "missing canonical identity; manual semantic assets require review" : "missing canonical identity; default KEEP"], manualAssets: assets });
  }

  entries.sort((a, b) => RECONCILIATION_BUCKETS.indexOf(a.bucket) - RECONCILIATION_BUCKETS.indexOf(b.bucket)
    || (a.oldTransactionId ?? Number.MAX_SAFE_INTEGER) - (b.oldTransactionId ?? Number.MAX_SAFE_INTEGER)
    || (a.canonicalSourceId ?? "").localeCompare(b.canonicalSourceId ?? ""));
  const bucketCounts = emptyCounts();
  for (const entry of entries) bucketCounts[entry.bucket] += 1;
  return { source: input.source, from: input.from, to: input.to, entries, bucketCounts };
}

export function financeReconciliationProjection(record: ReconciliationStoredRecord) {
  return {
    id: record.id,
    source: record.source,
    sourceId: record.sourceId,
    ...financeSourceFactProjection(record),
    lifeDomainOverride: record.lifeDomainOverride,
    semanticNote: record.semanticNote,
    personId: record.personId,
    projectId: record.projectId,
    assetId: record.assetId,
    eventId: record.eventId,
    placeId: record.placeId,
  };
}

export function reconciliationPreconditionHash(records: ReconciliationStoredRecord[]) {
  return sha256(stableJson(records.map(financeReconciliationProjection).sort((a, b) => a.id - b.id)));
}

export function createFinanceReconciliationSnapshot(records: ReconciliationStoredRecord[]) {
  const typeCounts = Object.fromEntries(["expense", "income", "refund", "transfer", "repayment"].map((type) => [type, 0])) as Record<string, number>;
  const domainDistribution: Record<string, number> = {};
  const monthlyDistribution: Record<string, { incomeCents: number; grossExpenseCents: number; refundCents: number; netExpenseCents: number }> = {};
  let incomeCents = 0;
  let grossExpenseCents = 0;
  let refundCents = 0;
  for (const record of records) {
    typeCounts[record.type] += 1;
    if (record.type === "income") incomeCents += record.amountCents;
    if (record.type === "expense") grossExpenseCents += record.amountCents;
    if (record.type === "refund") refundCents += record.amountCents;
    const month = record.occurredAt.slice(0, 7);
    const monthly = monthlyDistribution[month] ?? { incomeCents: 0, grossExpenseCents: 0, refundCents: 0, netExpenseCents: 0 };
    if (record.type === "income") monthly.incomeCents += record.amountCents;
    if (record.type === "expense") monthly.grossExpenseCents += record.amountCents;
    if (record.type === "refund") monthly.refundCents += record.amountCents;
    monthly.netExpenseCents = monthly.grossExpenseCents - monthly.refundCents;
    monthlyDistribution[month] = monthly;
    if (record.type === "expense" || record.type === "refund") {
      const domain = effectiveLifeDomain(record);
      domainDistribution[domain] = (domainDistribution[domain] ?? 0) + (record.type === "expense" ? record.amountCents : -record.amountCents);
    }
  }
  const netExpenseCents = grossExpenseCents - refundCents;
  if (netExpenseCents !== grossExpenseCents - refundCents) throw new Error("Finance accounting identity failed");
  const sourceIds = records.map((record) => `${record.source}:${record.sourceId}`).sort();
  const manualFieldCounts = {
    lifeDomainOverride: records.filter((record) => record.lifeDomainOverride !== null).length,
    semanticNote: records.filter((record) => record.semanticNote.trim() !== "").length,
    relations: records.filter((record) => [record.personId, record.projectId, record.assetId, record.eventId, record.placeId].some((value) => value !== null)).length,
  };
  return {
    records: records.length,
    incomeCents,
    grossExpenseCents,
    refundCents,
    netExpenseCents,
    familyCents: domainDistribution.family ?? 0,
    personalCents: netExpenseCents - (domainDistribution.family ?? 0),
    typeCounts,
    domainDistribution: Object.fromEntries(Object.entries(domainDistribution).sort(([a], [b]) => a.localeCompare(b))),
    monthlyDistribution: Object.fromEntries(Object.entries(monthlyDistribution).sort(([a], [b]) => a.localeCompare(b))),
    manualFieldCounts,
    generatedSourceIdCount: records.filter((record) => isGeneratedFinanceSourceId(record.sourceId)).length,
    sourceIdSetHash: sha256(stableJson(sourceIds)),
    rowProjectionHash: reconciliationPreconditionHash(records),
  };
}

function resolutionFor(entry: ReconciliationEntry): ReconciliationResolution | null {
  if (entry.bucket === "UNCHANGED" || entry.bucket === "OUT_OF_SCOPE" || entry.bucket === "INVALID_CANONICAL") return null;
  const action: ReconciliationAction = entry.bucket === "UPDATE" ? "UPDATE"
    : entry.bucket === "INSERT" ? "INSERT"
      : entry.bucket === "POSSIBLE_REKEY" ? "REKEY"
        : "KEEP";
  return {
    action,
    oldTransactionId: entry.oldTransactionId ?? null,
    oldSourceId: entry.oldSourceId ?? null,
    canonicalSourceId: entry.canonicalSourceId ?? null,
    reason: entry.reasons.join("; "),
    reviewed: false,
  };
}

export function createReconciliationManifest(fingerprint: CanonicalFingerprint, plan: ReconciliationPlan, preconditionHash: string): ReconciliationManifest {
  if (fingerprint.source !== plan.source || fingerprint.from !== plan.from || fingerprint.to !== plan.to) throw new Error("Fingerprint and plan scope differ");
  const { sha256: snapshotSha256, ...metadata } = fingerprint;
  return {
    batchId: `qianji-${plan.from}_${plan.to}-${snapshotSha256.slice(0, 8)}`,
    ...metadata,
    snapshotSha256,
    preconditionHash,
    bucketCounts: { ...plan.bucketCounts },
    resolutions: plan.entries.map(resolutionFor).filter((item): item is ReconciliationResolution => item !== null),
  };
}

export function validateReviewedManifest(value: unknown): ReconciliationManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid reconciliation manifest");
  const manifest = value as ReconciliationManifest;
  if (manifest.source !== "qianji" || !datePattern.test(manifest.from) || !datePattern.test(manifest.to) || manifest.from > manifest.to) throw new Error("Invalid manifest scope");
  if (typeof manifest.batchId !== "string" || !/^qianji-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(manifest.batchId)) throw new Error("Invalid batch id");
  if (typeof manifest.filename !== "string" || manifest.filename.length === 0 || !Number.isSafeInteger(manifest.fileSize) || manifest.fileSize < 0 || !Number.isSafeInteger(manifest.parsedRecordCount) || manifest.parsedRecordCount < 0) throw new Error("Invalid snapshot metadata");
  if (!/^[0-9a-f]{64}$/.test(manifest.snapshotSha256)) throw new Error("Invalid snapshot SHA-256");
  if (!/^[0-9a-f]{64}$/.test(manifest.preconditionHash) || !Array.isArray(manifest.resolutions)) throw new Error("Invalid manifest precondition");
  for (const resolution of manifest.resolutions) {
    if (!RECONCILIATION_ACTIONS.includes(resolution.action) || resolution.reviewed !== true || typeof resolution.reason !== "string" || resolution.reason.trim() === "") throw new Error("Every resolution must use an allowed action, include a reason, and be reviewed");
    if (resolution.oldTransactionId !== null && (!Number.isSafeInteger(resolution.oldTransactionId) || resolution.oldTransactionId <= 0)) throw new Error("Invalid old transaction id");
  }
  return manifest;
}

function findOld(records: ReconciliationStoredRecord[], resolution: ReconciliationResolution) {
  return records.find((record) => record.id === resolution.oldTransactionId && record.sourceId === resolution.oldSourceId);
}

export function buildReconciliationOperations(current: ReconciliationStoredRecord[], canonical: NormalizedFinanceTransaction[], manifestValue: unknown) {
  const manifest = validateReviewedManifest(manifestValue);
  if (reconciliationPreconditionHash(current) !== manifest.preconditionHash) throw new Error("BLOCK: scoped production precondition changed");
  const currentPlan = planQianJiReconciliation({ existing: current, canonical, source: manifest.source, from: manifest.from, to: manifest.to });
  if (currentPlan.bucketCounts.INVALID_CANONICAL > 0) throw new Error("BLOCK: canonical snapshot contains invalid or duplicate identities");
  if (stableJson(currentPlan.bucketCounts) !== stableJson(manifest.bucketCounts)) throw new Error("BLOCK: planner buckets changed since review");
  const required = currentPlan.entries.filter((entry) => !["UNCHANGED", "OUT_OF_SCOPE", "INVALID_CANONICAL"].includes(entry.bucket));
  if (required.length !== manifest.resolutions.length) throw new Error("BLOCK: reviewed resolution coverage is incomplete");
  const resolutionSignatures = new Set(manifest.resolutions.map((resolution) => `${resolution.oldTransactionId ?? ""}|${resolution.oldSourceId ?? ""}|${resolution.canonicalSourceId ?? ""}`));
  if (resolutionSignatures.size !== manifest.resolutions.length) throw new Error("BLOCK: duplicate reviewed resolution");
  for (const entry of required) {
    const covered = manifest.resolutions.some((resolution) => {
      if (entry.bucket === "AMBIGUOUS") return resolution.canonicalSourceId === entry.canonicalSourceId;
      return resolution.oldTransactionId === (entry.oldTransactionId ?? null)
        && resolution.oldSourceId === (entry.oldSourceId ?? null)
        && resolution.canonicalSourceId === (entry.canonicalSourceId ?? null);
    });
    if (!covered) throw new Error("BLOCK: reviewed resolution coverage is incomplete");
  }
  const canonicalById = new Map(canonical.map((record) => [record.sourceId, record]));
  if (canonicalById.size !== canonical.length) throw new Error("BLOCK: duplicate canonical identity");
  const operations: ReconciliationOperation[] = [];
  for (const resolution of manifest.resolutions) {
    if (resolution.action === "KEEP") continue;
    const oldRecord = resolution.oldTransactionId === null ? null : findOld(current, resolution);
    const canonicalRecord = resolution.canonicalSourceId === null ? null : canonicalById.get(resolution.canonicalSourceId) ?? null;
    if (resolution.action === "INSERT") {
      if (!canonicalRecord || current.some((record) => record.source === "qianji" && record.sourceId === canonicalRecord.sourceId)) throw new Error("BLOCK: invalid or colliding insert");
      operations.push({ action: "INSERT", canonical: canonicalRecord });
    } else if (resolution.action === "DELETE") {
      if (!oldRecord || !inScope(oldRecord, manifest.source, manifest.from, manifest.to)) throw new Error("BLOCK: delete target changed or escaped scope");
      operations.push({ action: "DELETE", oldTransactionId: oldRecord.id, expectedOldSourceId: oldRecord.sourceId });
    } else if (resolution.action === "UPDATE") {
      if (!oldRecord || !canonicalRecord || oldRecord.sourceId !== canonicalRecord.sourceId) throw new Error("BLOCK: UPDATE requires unchanged exact identity");
      operations.push({ action: "UPDATE", oldTransactionId: oldRecord.id, expectedOldSourceId: oldRecord.sourceId, canonical: canonicalRecord });
    } else {
      if (!oldRecord || !canonicalRecord || oldRecord.sourceId === canonicalRecord.sourceId) throw new Error("BLOCK: REKEY requires one old and one new identity");
      const collision = current.find((record) => record.source === "qianji" && record.sourceId === canonicalRecord.sourceId && record.id !== oldRecord.id);
      if (collision) throw new Error("BLOCK: rekey target identity already exists");
      operations.push({ action: "REKEY", oldTransactionId: oldRecord.id, expectedOldSourceId: oldRecord.sourceId, canonical: canonicalRecord });
    }
  }
  return { manifest, operations };
}

export async function applyReviewedReconciliation(input: {
  store: ReconciliationStore;
  manifest: unknown;
  canonical: NormalizedFinanceTransaction[];
  fingerprint: CanonicalFingerprint;
  target: "production" | "isolated";
}) {
  if (input.target === "production") throw new Error("BLOCK: production reconciliation is disabled in this Sprint");
  const manifest = validateReviewedManifest(input.manifest);
  if (manifest.source !== input.fingerprint.source || manifest.from !== input.fingerprint.from || manifest.to !== input.fingerprint.to
    || manifest.snapshotSha256 !== input.fingerprint.sha256 || manifest.filename !== input.fingerprint.filename
    || manifest.fileSize !== input.fingerprint.fileSize || manifest.parsedRecordCount !== input.fingerprint.parsedRecordCount
    || manifest.adapterCommit !== input.fingerprint.adapterCommit) {
    throw new Error("BLOCK: canonical snapshot fingerprint changed");
  }
  const current = await input.store.loadScoped(manifest.source, manifest.from, manifest.to);
  const before = createFinanceReconciliationSnapshot(current);
  const { operations } = buildReconciliationOperations(current, input.canonical, manifest);
  await input.store.applyOperations(operations);
  const afterRecords = await input.store.loadScoped(manifest.source, manifest.from, manifest.to);
  const after = createFinanceReconciliationSnapshot(afterRecords);
  return { batchId: manifest.batchId, atomicity: input.store.atomicity, operationCount: operations.length, before, after };
}

export function applyOperationsToRecords(records: ReconciliationStoredRecord[], operations: ReconciliationOperation[], updatedAt = new Date().toISOString()) {
  const next = records.map((record) => ({ ...record, tags: [...record.tags] }));
  for (const operation of operations) {
    if (operation.action === "INSERT") {
      if (next.some((record) => identity(record) === identity(operation.canonical))) throw new Error("Insert identity collision");
      const nextId = next.reduce((maximum, record) => Math.max(maximum, record.id), 0) + 1;
      next.push({
        ...operation.canonical,
        tags: [...operation.canonical.tags],
        id: nextId,
        lifeDomainOverride: null,
        semanticNote: "",
        personId: null,
        projectId: null,
        assetId: null,
        eventId: null,
        placeId: null,
        createdAt: updatedAt,
        updatedAt,
      });
      continue;
    }
    const index = next.findIndex((record) => record.id === operation.oldTransactionId && record.source === "qianji" && record.sourceId === operation.expectedOldSourceId);
    if (index < 0) throw new Error("Operation target changed");
    if (operation.action === "DELETE") {
      next.splice(index, 1);
      continue;
    }
    const previous = next[index];
    next[index] = {
      ...previous,
      ...operation.canonical,
      sourceId: operation.action === "REKEY" ? operation.canonical.sourceId : previous.sourceId,
      id: previous.id,
      tags: [...operation.canonical.tags],
      lifeDomainOverride: previous.lifeDomainOverride,
      semanticNote: previous.semanticNote,
      personId: previous.personId,
      projectId: previous.projectId,
      assetId: previous.assetId,
      eventId: previous.eventId,
      placeId: previous.placeId,
      createdAt: previous.createdAt,
      updatedAt,
    };
  }
  return next;
}
