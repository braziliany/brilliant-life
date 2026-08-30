import { eq } from "drizzle-orm";
import type { getDb } from "../../../db";
import { financeTransactions } from "../../../db/schema.ts";
import { toFinanceTransactionAuditView } from "./domain.ts";
import { toFinanceRecord } from "./import-service.ts";
import { isLifeDomain, type LifeDomain } from "./types.ts";

type FinanceDb = ReturnType<typeof getDb>;
const jsonHeaders = { "Cache-Control": "no-store" };

export type FinanceOverrideMutation = {
  id: number;
  lifeDomainOverride: LifeDomain | null;
};

export function readFinanceOverrideMutation(value: unknown): FinanceOverrideMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "lifeDomainOverride") return null;
  if (!Number.isSafeInteger(input.id) || Number(input.id) < 1) return null;
  if (input.lifeDomainOverride !== null && !isLifeDomain(input.lifeDomainOverride)) return null;
  return { id: Number(input.id), lifeDomainOverride: input.lifeDomainOverride as LifeDomain | null };
}

export async function updateFinanceLifeDomainOverride(db: FinanceDb, mutation: FinanceOverrideMutation) {
  const [row] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, mutation.id)).limit(1);
  if (!row) return null;
  if (row.lifeDomainOverride === mutation.lifeDomainOverride) {
    return { transaction: toFinanceTransactionAuditView(toFinanceRecord(row)), changed: false };
  }
  const [updated] = await db.update(financeTransactions).set({
    lifeDomainOverride: mutation.lifeDomainOverride,
    updatedAt: new Date().toISOString(),
  }).where(eq(financeTransactions.id, mutation.id)).returning();
  if (!updated) return null;
  return { transaction: toFinanceTransactionAuditView(toFinanceRecord(updated)), changed: true };
}

export async function handleFinanceOverrideMutation(request: Request, db: FinanceDb) {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415, headers: jsonHeaders });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: jsonHeaders });
  }
  const mutation = readFinanceOverrideMutation(payload);
  if (!mutation) return Response.json({ error: "Invalid finance classification update" }, { status: 400, headers: jsonHeaders });
  try {
    const result = await updateFinanceLifeDomainOverride(db, mutation);
    if (!result) return Response.json({ error: "Finance transaction not found" }, { status: 404, headers: jsonHeaders });
    return Response.json(result, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Finance classification update failed" }, { status: 500, headers: jsonHeaders });
  }
}
