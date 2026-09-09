import type { FinanceImportValidation, FinanceSourceAdapter, NormalizedFinanceTransaction } from "../types.ts";
import { inspectQianJiRows, normalizeQianJiRow } from "./shared.ts";

const candidateValues = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["transactions", "records", "bills", "data", "list"]) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
};

const candidateRows = (payload: unknown): Array<Record<string, unknown>> => candidateValues(payload).filter((item): item is Record<string, unknown> => !!item && typeof item === "object");

export class QianJiJsonAdapter implements FinanceSourceAdapter<string | unknown> {
  readonly source = "qianji";

  async inspect(input: string | unknown): Promise<FinanceImportValidation> {
    try {
      const payload = typeof input === "string" ? JSON.parse(input) : input;
      const values = candidateValues(payload);
      if (!values.length) return inspectQianJiRows([], "json", [{ code: "invalid_structure" }]);
      const rows = values.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {});
      return inspectQianJiRows(rows, "json");
    } catch {
      return inspectQianJiRows([], "json", [{ code: "invalid_structure" }]);
    }
  }

  async parse(input: string | unknown): Promise<NormalizedFinanceTransaction[]> {
    const payload = typeof input === "string" ? JSON.parse(input) : input;
    return candidateRows(payload).map(normalizeQianJiRow).filter((item): item is NormalizedFinanceTransaction => item !== null);
  }
}
