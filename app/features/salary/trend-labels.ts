// Presentation only: leave saved values and trend coordinates untouched.
export function salaryTrendMonthLabel(month: string, previousMonth?: string): string {
  const label = `${Number(month.slice(5))}月`;
  return !previousMonth || month.slice(0, 4) !== previousMonth.slice(0, 4)
    ? `${month.slice(0, 4)}年\n${label}`
    : label;
}
