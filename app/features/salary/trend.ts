import type { SalaryRecord } from "../../page-view.types.ts";

export type SalaryTrendPoint = {
  month: string;
  value: number;
  x: number;
  y: number;
  showMonth: boolean;
};

const LEFT = 4;
const RIGHT = 96;
const TOP = 8;
const BOTTOM = 88;

export function buildSalaryTrendPoints(records: SalaryRecord[]): SalaryTrendPoint[] {
  const ordered = [...records].sort((left, right) => left.month.localeCompare(right.month));
  if (ordered.length === 0) return [];

  const values = ordered.map((record) => record.netSalary);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = Math.max(1, maximum - minimum);
  const monthStep = Math.max(1, Math.ceil(ordered.length / 8));

  return ordered.map((record, index) => ({
    month: record.month,
    value: record.netSalary,
    x: ordered.length === 1 ? 50 : LEFT + (RIGHT - LEFT) * index / (ordered.length - 1),
    y: ordered.length === 1 ? 50 : TOP + (maximum - record.netSalary) / range * (BOTTOM - TOP),
    showMonth: ordered.length <= 8 || index === 0 || index === ordered.length - 1 || index % monthStep === 0,
  }));
}
