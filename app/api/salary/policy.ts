export const SALARY_POLICY = Object.freeze({
  dailyRate: 275,
  deductions: 130,
  taxThreshold: 5000,
  taxRate: 3,
  extraIncome: 0,
  bonus: 0,
  leaveDeduction: 0,
});

export function calculateSalary(workdays: number) {
  const { dailyRate, deductions, taxThreshold, taxRate, extraIncome, bonus, leaveDeduction } = SALARY_POLICY;
  const grossSalary = workdays * dailyRate + extraIncome + bonus;
  const taxableIncome = Math.max(0, grossSalary - deductions - leaveDeduction - taxThreshold);
  const incomeTax = taxableIncome * taxRate / 100;
  return {
    ...SALARY_POLICY,
    grossSalary,
    taxableIncome,
    incomeTax,
    netSalary: grossSalary - deductions - leaveDeduction - incomeTax,
  };
}
