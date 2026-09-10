import type { AnnualSummaryDraft } from "../annual/domain";
import type { SalaryRecord, WorkExperience } from "../../page-view.types";

export type TimelineItemKind = "career" | "salary" | "annual";
export type TimelineDatePrecision = "month" | "year";

export type TimelineItem = {
  id: string;
  kind: TimelineItemKind;
  datePrecision: TimelineDatePrecision;
  year: number;
  month?: number;
  title: string;
  summary?: string;
  source: string;
  href: string;
};

export type TimelineInput = {
  experiences: WorkExperience[];
  salaryRecords: SalaryRecord[];
  annualSummaries: AnnualSummaryDraft[];
};

export type TimelineYearGroup = {
  year: number;
  items: TimelineItem[];
};
