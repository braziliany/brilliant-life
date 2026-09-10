import type { AnnualSummaryDraft } from "../annual/domain.ts";
import type { SalaryRecord, WorkExperience } from "../../page-view.types.ts";
import type { TimelineInput, TimelineItem, TimelineItemKind, TimelineYearGroup } from "./types.ts";

const kindOrder: Record<TimelineItemKind, number> = {
  career: 0,
  salary: 1,
  annual: 2,
};

const money = (value: number) => value.toLocaleString("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const careerItem = (experience: WorkExperience): TimelineItem => {
  const [year, month] = experience.startDate.split("-").map(Number);
  return {
    id: `career:${experience.id}`,
    kind: "career",
    datePrecision: "month",
    year,
    month,
    title: `${experience.company} · ${experience.role}`,
    summary: experience.endDate
      ? `${experience.startDate} 至 ${experience.endDate}`
      : `${experience.startDate} 至今`,
    source: "work_experiences",
    href: "/#career",
  };
};

const salaryItem = (record: SalaryRecord): TimelineItem => {
  const [year, month] = record.month.split("-").map(Number);
  return {
    id: `salary:${record.month}`,
    kind: "salary",
    datePrecision: "month",
    year,
    month,
    title: `¥${money(record.netSalary)}`,
    summary: `${record.workdays} 个工作日`,
    source: "salary_records",
    href: "/#finance",
  };
};

const annualItem = (summary: AnnualSummaryDraft): TimelineItem => ({
  id: `annual:${summary.year}`,
  kind: "annual",
  datePrecision: "year",
  year: summary.year,
  title: `${summary.year} 年度记录`,
  summary: summary.periodStatus === "in-progress"
    ? `截至 ${summary.asOfDate}`
    : "查看这一年的记录",
  source: summary.calculationVersion,
  href: `/?annual=${summary.year}#annual`,
});

export function sortTimelineItems(items: TimelineItem[]) {
  return [...items].sort((left, right) =>
    right.year - left.year
    || (right.month ?? 0) - (left.month ?? 0)
    || kindOrder[left.kind] - kindOrder[right.kind]
    || left.id.localeCompare(right.id),
  );
}

export function deriveTimelineItems(input: TimelineInput) {
  return sortTimelineItems([
    ...input.experiences.map(careerItem),
    ...input.salaryRecords.map(salaryItem),
    ...input.annualSummaries.map(annualItem),
  ]);
}

export function groupTimelineItemsByYear(items: TimelineItem[]): TimelineYearGroup[] {
  const groups = new Map<number, TimelineItem[]>();
  for (const item of sortTimelineItems(items)) {
    groups.set(item.year, [...(groups.get(item.year) ?? []), item]);
  }
  return [...groups].map(([year, groupItems]) => ({ year, items: groupItems }));
}

export function collectTimelineYears(
  experiences: WorkExperience[],
  salaryRecords: SalaryRecord[],
  currentYear: number,
) {
  const years = new Set<number>();
  for (const record of salaryRecords) years.add(Number(record.month.slice(0, 4)));
  for (const experience of experiences) {
    const startYear = Number(experience.startDate.slice(0, 4));
    const endYear = Number((experience.endDate ?? String(currentYear)).slice(0, 4));
    for (let year = startYear; year <= endYear; year += 1) years.add(year);
  }
  return [...years].sort((left, right) => right - left);
}
