import type { FinanceSourceAdapter, NormalizedFinanceTransaction } from "../types.ts";
import { normalizeQianJiRow } from "./shared.ts";

const candidateRows = (payload: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["transactions", "records", "bills", "data", "list"]) {
    if (Array.isArray(record[key])) return candidateRows(record[key]);
  }
  return [];
};

export class QianJiJsonAdapter implements FinanceSourceAdapter<string | unknown> {
  readonly source = "qianji";

  async parse(input: string | unknown): Promise<NormalizedFinanceTransaction[]> {
    const payload = typeof input === "string" ? JSON.parse(input) : input;
    return candidateRows(payload).map(normalizeQianJiRow).filter((item): item is NormalizedFinanceTransaction => item !== null);
  }
}
