import type { SalaryPolicy } from "../../page-view.types";

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
