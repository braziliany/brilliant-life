import assert from "node:assert/strict";
import test from "node:test";

import { calculateSalary as calculateApiSalary, SALARY_POLICY } from "../app/api/salary/policy.ts";
import { countCalendarMonthWorkdays } from "../app/features/calendar/domain.ts";
import {
  calculateGrossSalary,
  calculateIncomeTax,
  calculateNetSalary,
  calculateSalarySummary,
  calculateTaxableIncome,
} from "../app/features/salary/domain.ts";

const policy = {
  dailyRate: 275,
  deductions: 130,
  taxThreshold: 5_000,
  taxRate: 3,
  extraIncome: 0,
  bonus: 0,
  leaveDeduction: 0,
};

test("2026-07 salary snapshot remains exactly unchanged", () => {
  assert.deepEqual(calculateSalarySummary(23, policy), {
    grossSalary: 6_325,
    taxableIncome: 1_195,
    incomeTax: 35.85,
    netSalary: 6_159.15,
  });
});

test("salary calculations preserve extra income, bonus, and leave deduction", () => {
  const completePolicy = {
    ...policy,
    extraIncome: 300,
    bonus: 500,
    leaveDeduction: 200,
  };
  const grossSalary = calculateGrossSalary(20, completePolicy);
  const taxableIncome = calculateTaxableIncome(grossSalary, completePolicy);
  const incomeTax = calculateIncomeTax(taxableIncome, completePolicy.taxRate);

  assert.equal(grossSalary, 6_300);
  assert.equal(taxableIncome, 970);
  assert.equal(incomeTax, 29.1);
  assert.equal(calculateNetSalary(grossSalary, incomeTax, completePolicy), 5_940.9);
  assert.deepEqual(calculateSalarySummary(20, completePolicy), {
    grossSalary: 6_300,
    taxableIncome: 970,
    incomeTax: 29.1,
    netSalary: 5_940.9,
  });
});

test("taxable income preserves zero-floor and threshold boundary behavior", () => {
  assert.equal(calculateTaxableIncome(4_000, policy), 0);
  assert.equal(calculateTaxableIncome(5_130, policy), 0);
  assert.equal(calculateTaxableIncome(5_131, policy), 1);
  assert.equal(calculateIncomeTax(0, policy.taxRate), 0);
  assert.equal(calculateIncomeTax(1, policy.taxRate), 0.03);
});

test("zero workdays and raw JavaScript precision remain unchanged", () => {
  assert.deepEqual(calculateSalarySummary(0, policy), {
    grossSalary: 0,
    taxableIncome: 0,
    incomeTax: 0,
    netSalary: -130,
  });
  assert.equal(calculateIncomeTax(1.1, 3), 1.1 * 3 / 100);
});

test("salary domain remains identical to the frozen API policy calculation", () => {
  for (const workdays of [0, 18, 23, 31]) {
    const apiResult = calculateApiSalary(workdays);
    assert.deepEqual(calculateSalarySummary(workdays, SALARY_POLICY), {
      grossSalary: apiResult.grossSalary,
      taxableIncome: apiResult.taxableIncome,
      incomeTax: apiResult.incomeTax,
      netSalary: apiResult.netSalary,
    });
  }
});

test("calendar workdays preserve the complete July salary chain", () => {
  const workdays = countCalendarMonthWorkdays(2026, 6, {});
  assert.equal(workdays, 23);
  assert.deepEqual(calculateSalarySummary(workdays, policy), {
    grossSalary: 6_325,
    taxableIncome: 1_195,
    incomeTax: 35.85,
    netSalary: 6_159.15,
  });
});
