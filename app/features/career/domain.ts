import type { WorkExperience, WorkExperienceDraft } from "../../page-view.types";

export const createEmptyWorkExperienceDraft = (): WorkExperienceDraft => ({
  company: "",
  role: "",
  startDate: "",
  endDate: null,
  summary: "",
});

export const toWorkExperienceDraft = (experience: WorkExperience): WorkExperienceDraft => ({
  company: experience.company,
  role: experience.role,
  startDate: experience.startDate,
  endDate: experience.endDate,
  summary: experience.summary,
});

export const sortWorkExperiences = (experiences: WorkExperience[]) =>
  [...experiences].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);

export const upsertWorkExperience = (
  experiences: WorkExperience[],
  experience: WorkExperience,
  editingId: number | null,
) => sortWorkExperiences(editingId
  ? experiences.map((item) => item.id === experience.id ? experience : item)
  : [...experiences, experience]);

export const removeWorkExperience = (experiences: WorkExperience[], experienceId: number) =>
  experiences.filter((experience) => experience.id !== experienceId);

export const formatWorkExperienceDuration = (
  startDate: string,
  endDate: string | null,
  currentMonth: string,
) => {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = (endDate ?? currentMonth).split("-").map(Number);
  const months = Math.max(0, (endYear - startYear) * 12 + endMonth - startMonth + 1);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return [years ? `${years} 年` : "", remainingMonths ? `${remainingMonths} 个月` : ""].filter(Boolean).join(" ") || "不足 1 个月";
};
