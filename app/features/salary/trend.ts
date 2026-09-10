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
const TOP = 10;
const BOTTOM = 90;
const DOMAIN_PADDING_RATIO = 0.2;
const MINIMUM_DOMAIN_SPAN = 1000;
const MINIMUM_DOMAIN_RATIO = 0.2;

export function buildSalaryTrendPoints(records: SalaryRecord[]): SalaryTrendPoint[] {
  const ordered = [...records].sort((left, right) => left.month.localeCompare(right.month));
  if (ordered.length === 0) return [];

  const values = ordered.map((record) => record.netSalary);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const midpoint = (minimum + maximum) / 2;
  const observedSpan = maximum - minimum;
  const paddedSpan = observedSpan * (1 + DOMAIN_PADDING_RATIO * 2);
  const minimumSpan = Math.max(MINIMUM_DOMAIN_SPAN, Math.abs(midpoint) * MINIMUM_DOMAIN_RATIO);
  const domainSpan = Math.max(paddedSpan, minimumSpan);
  const domainMaximum = midpoint + domainSpan / 2;
  const monthStep = Math.max(1, Math.ceil(ordered.length / 8));

  return ordered.map((record, index) => ({
    month: record.month,
    value: record.netSalary,
    x: ordered.length === 1 ? 50 : LEFT + (RIGHT - LEFT) * index / (ordered.length - 1),
    y: ordered.length === 1 ? 50 : TOP + (domainMaximum - record.netSalary) / domainSpan * (BOTTOM - TOP),
    showMonth: ordered.length <= 8 || index === 0 || index === ordered.length - 1 || index % monthStep === 0,
  }));
}
