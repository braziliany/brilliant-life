import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyWorkExperienceDraft,
  formatWorkExperienceDuration,
  removeWorkExperience,
  selectCurrentCareerStage,
  sortWorkExperiences,
  toWorkExperienceDraft,
  upsertWorkExperience,
} from "../app/features/career/domain.ts";

const experiences = [
  { id: 8, company: "博士电动工具（杭州）有限公司", role: "普工", startDate: "2024-02", endDate: null, summary: "仓库搬运工，临时工" },
  { id: 3, company: "蜂巢能源科技有限公司", role: "普工", startDate: "2022-02", endDate: "2023-12", summary: "操作机器" },
  { id: 2, company: "江苏星源新材料科技有限公司", role: "普工", startDate: "2018-05", endDate: "2020-12", summary: "操作机器" },
];

test("empty work experience draft preserves the current form defaults", () => {
  assert.deepEqual(createEmptyWorkExperienceDraft(), {
    company: "",
    role: "",
    startDate: "",
    endDate: null,
    summary: "",
  });
});

test("current career stage prefers an active record then the latest past fact", () => {
  assert.equal(selectCurrentCareerStage(experiences, "2026-08")?.id, 8);
  assert.equal(selectCurrentCareerStage(experiences.slice(1), "2026-08")?.id, 3);
  assert.equal(selectCurrentCareerStage([], "2026-08"), null);
});

test("editing draft copies every editable field without id or mutation", () => {
  const experience = experiences[0];
  const before = structuredClone(experience);
  const draft = toWorkExperienceDraft(experience);

  assert.deepEqual(draft, {
    company: experience.company,
    role: experience.role,
    startDate: experience.startDate,
    endDate: experience.endDate,
    summary: experience.summary,
  });
  assert.equal("id" in draft, false);
  assert.deepEqual(experience, before);
});

test("work experiences preserve ascending start month and id ordering", () => {
  const sameMonth = [
    { ...experiences[1], id: 9 },
    { ...experiences[1], id: 4 },
  ];
  const sorted = sortWorkExperiences([experiences[0], ...sameMonth, experiences[2]]);

  assert.deepEqual(sorted.map(({ id }) => id), [2, 4, 9, 8]);
});

test("sorting returns a new array without changing its input", () => {
  const input = [...experiences];
  const before = structuredClone(input);
  const sorted = sortWorkExperiences(input);

  assert.notEqual(sorted, input);
  assert.deepEqual(input, before);
});

test("adding an experience appends and restores chronological order", () => {
  const added = { id: 5, company: "新单位", role: "操作员", startDate: "2021-06", endDate: "2021-12", summary: "" };
  const result = upsertWorkExperience(experiences, added, null);

  assert.deepEqual(result.map(({ id }) => id), [2, 5, 3, 8]);
  assert.equal(experiences.some(({ id }) => id === added.id), false);
});

test("editing replaces only the response id and restores chronological order", () => {
  const updated = { ...experiences[1], startDate: "2017-01", company: "修改后的单位" };
  const before = structuredClone(experiences);
  const result = upsertWorkExperience(experiences, updated, experiences[1].id);

  assert.deepEqual(result.map(({ id }) => id), [3, 2, 8]);
  assert.equal(result[0], updated);
  assert.deepEqual(experiences, before);
});

test("removing an experience filters only the target id without mutation", () => {
  const before = structuredClone(experiences);
  const result = removeWorkExperience(experiences, 3);

  assert.deepEqual(result.map(({ id }) => id), [8, 2]);
  assert.deepEqual(experiences, before);
});

test("duration preserves inclusive month calculation and exact labels", () => {
  assert.equal(formatWorkExperienceDuration("2018-05", "2020-12", "2026-08"), "2 年 8 个月");
  assert.equal(formatWorkExperienceDuration("2022-02", "2023-12", "2026-08"), "1 年 11 个月");
  assert.equal(formatWorkExperienceDuration("2024-02", null, "2026-08"), "2 年 7 个月");
  assert.equal(formatWorkExperienceDuration("2026-08", "2026-08", "2026-08"), "1 个月");
  assert.equal(formatWorkExperienceDuration("2026-08", "2026-07", "2026-08"), "不足 1 个月");
});
