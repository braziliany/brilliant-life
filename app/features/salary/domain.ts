import type { SalaryPolicy, SalaryRecord } from "../../page-view.types";

export const calculateGrossSalary = (workdays: number, policy: SalaryPolicy) =>
  workdays * policy.dailyRate + policy.extraIncome + policy.bonus;

export const calculateTaxableIncome = (grossSalary: number, policy: SalaryPolicy) =>
  Math.max(0, grossSalary - policy.deductions - policy.leaveDeduction - policy.taxThreshold);

export const calculateIncomeTax = (taxableIncome: number, taxRate: number) =>
  taxableIncome * taxRate / 100;

export const calculateNetSalary = (
  grossSalary: number,
  incomeTax: number,
  policy: SalaryPolicy,
) => grossSalary - policy.deductions - policy.leaveDeduction - incomeTax;

export const calculateSalarySummary = (workdays: number, policy: SalaryPolicy) => {
  const grossSalary = calculateGrossSalary(workdays, policy);
  const taxableIncome = calculateTaxableIncome(grossSalary, policy);
  const incomeTax = calculateIncomeTax(taxableIncome, policy.taxRate);
  const netSalary = calculateNetSalary(grossSalary, incomeTax, policy);

  return { grossSalary, taxableIncome, incomeTax, netSalary };
};

export const summarizeSavedSalaryYear = (records: SalaryRecord[], year: number) => {
  const saved = records.filter((record) => record.month.startsWith(`${year}-`));
  return {
    savedMonths: saved.length,
    totalNetSalary: saved.reduce((total, record) => total + record.netSalary, 0),
    totalIncomeTax: saved.reduce((total, record) => total + record.incomeTax, 0),
  };
};
