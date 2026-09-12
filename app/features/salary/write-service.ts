import { eq } from "drizzle-orm";
import type { getDb } from "../../../db";
import { salaryRecords } from "../../../db/schema.ts";
import { validMonth } from "../../api/validation.ts";
import type { SalaryPolicy, SalaryRecordInput } from "../../page-view.types.ts";
import { calculateSalarySummary } from "./domain.ts";

type SalaryDb = ReturnType<typeof getDb>;
type SalaryWriteMode = "create" | "update";

const jsonHeaders = { "Cache-Control": "no-store" };
const salaryInputKeys = [
  "bonus",
  "dailyRate",
  "deductions",
  "extraIncome",
  "leaveDeduction",
  "month",
  "taxRate",
  "taxThreshold",
  "workdays",
] as const;
const quickSaveKeys = ["month", "workdays"] as const;

const exactKeys = (input: Record<string, unknown>, expected: readonly string[]) => {
  const keys = Object.keys(input).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const validMoney = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000_000;

export function readSalaryRecordInput(value: unknown): SalaryRecordInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!exactKeys(input, salaryInputKeys)) return null;
  if (!validMonth(input.month)) return null;
  if (!Number.isInteger(input.workdays) || Number(input.workdays) < 0 || Number(input.workdays) > 31) return null;
  if (!validMoney(input.dailyRate) || !validMoney(input.deductions) || !validMoney(input.taxThreshold)) return null;
  if (!validMoney(input.extraIncome) || !validMoney(input.bonus) || !validMoney(input.leaveDeduction)) return null;
  if (typeof input.taxRate !== "number" || !Number.isFinite(input.taxRate) || input.taxRate < 0 || input.taxRate > 100) return null;
  return input as SalaryRecordInput;
}

export function readSalaryQuickSave(value: unknown): { month: string; workdays: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!exactKeys(input, quickSaveKeys)) return null;
  if (!validMonth(input.month)) return null;
  if (!Number.isInteger(input.workdays) || Number(input.workdays) < 0 || Number(input.workdays) > 31) return null;
  return { month: input.month, workdays: Number(input.workdays) };
}

export function calculateSalaryRecord(input: SalaryRecordInput) {
  const policy: SalaryPolicy = {
    dailyRate: input.dailyRate,
    deductions: input.deductions,
    taxThreshold: input.taxThreshold,
    taxRate: input.taxRate,
    extraIncome: input.extraIncome,
    bonus: input.bonus,
    leaveDeduction: input.leaveDeduction,
  };
  return {
    ...input,
    ...calculateSalarySummary(input.workdays, policy),
  };
}

const valuesFor = (input: SalaryRecordInput) => ({
  ...calculateSalaryRecord(input),
  updatedAt: new Date().toISOString(),
});

export async function createSalaryRecord(db: SalaryDb, input: SalaryRecordInput) {
  const [record] = await db.insert(salaryRecords).values(valuesFor(input)).onConflictDoNothing({
    target: salaryRecords.month,
  }).returning();
  if (!record) return { conflict: true as const };
  return { conflict: false as const, record };
}

export async function updateSalaryRecord(db: SalaryDb, input: SalaryRecordInput) {
  const [existing] = await db.select().from(salaryRecords).where(eq(salaryRecords.month, input.month)).limit(1);
  if (!existing) return null;
  const [record] = await db.update(salaryRecords).set(valuesFor(input)).where(eq(salaryRecords.month, input.month)).returning();
  return record ?? null;
}

export async function upsertCurrentSalaryRecord(db: SalaryDb, input: SalaryRecordInput) {
  const values = valuesFor(input);
  const [record] = await db.insert(salaryRecords).values(values).onConflictDoUpdate({
    target: salaryRecords.month,
    set: values,
  }).returning();
  return record;
}

async function jsonPayload(request: Request) {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { response: Response.json({ error: "Content-Type must be application/json" }, { status: 415, headers: jsonHeaders }) };
  }
  try {
    return { payload: await request.json() };
  } catch {
    return { response: Response.json({ error: "Invalid JSON body" }, { status: 400, headers: jsonHeaders }) };
  }
}

export async function handleSalaryRecordMutation(
  request: Request,
  db: SalaryDb,
  mode: SalaryWriteMode,
  currentPolicy?: SalaryPolicy,
) {
  const parsed = await jsonPayload(request);
  if (parsed.response) return parsed.response;
  try {
    if (mode === "update" && currentPolicy) {
      const quick = readSalaryQuickSave(parsed.payload);
      if (quick) {
        const record = await upsertCurrentSalaryRecord(db, { ...quick, ...currentPolicy });
        return Response.json({ record }, { headers: jsonHeaders });
      }
    }
    const input = readSalaryRecordInput(parsed.payload);
    if (!input) return Response.json({ error: "Invalid salary record" }, { status: 400, headers: jsonHeaders });
    if (mode === "create") {
      const created = await createSalaryRecord(db, input);
      if (created.conflict) return Response.json({ error: "Salary month already exists" }, { status: 409, headers: jsonHeaders });
      return Response.json({ record: created.record }, { status: 201, headers: jsonHeaders });
    }
    const record = await updateSalaryRecord(db, input);
    if (!record) return Response.json({ error: "Salary record not found" }, { status: 404, headers: jsonHeaders });
    return Response.json({ record }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Salary update failed" }, { status: 500, headers: jsonHeaders });
  }
}
