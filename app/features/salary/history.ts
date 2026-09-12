import type { SalaryPolicy, SalaryRecord, SalaryRecordInput } from "../../page-view.types.ts";

export const salaryInputFromRecord = (record: SalaryRecord): SalaryRecordInput => ({
  month: record.month,
  workdays: record.workdays,
  dailyRate: record.dailyRate,
  deductions: record.deductions,
  taxThreshold: record.taxThreshold,
  taxRate: record.taxRate,
  extraIncome: record.extraIncome,
  bonus: record.bonus,
  leaveDeduction: record.leaveDeduction,
});

export const newSalaryInput = (policy: SalaryPolicy, workdays: number): SalaryRecordInput => ({
  month: "",
  workdays,
  ...policy,
});

export const mergeSavedSalaryRecord = (records: SalaryRecord[], saved: SalaryRecord) =>
  [saved, ...records.filter((record) => record.month !== saved.month)]
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, 12);
