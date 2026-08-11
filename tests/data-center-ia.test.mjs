import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const page = read("app/page.tsx");
const nav = read("app/components/shell/DataQuickNav.tsx");
const overview = read("app/components/shell/DataCenterOverview.tsx");
const health = read("app/features/health/HealthOverviewCard.tsx");
const calendar = read("app/features/calendar/WorkCalendarCard.tsx");
const career = read("app/features/career/WorkExperienceTimeline.tsx");
const salary = read("app/features/salary/SalaryDashboard.tsx");
const styles = read("app/globals.css");

test("data center exposes overview and four life domains", () => {
  assert.match(nav, /data-overview[\s\S]*总览/);
  assert.match(nav, /health[\s\S]*健康/);
  assert.match(nav, /time[\s\S]*时间/);
  assert.match(nav, /career[\s\S]*职业/);
  assert.match(nav, /finance[\s\S]*财务/);
  assert.doesNotMatch(nav, /每日目标|工作经历|工资"/);
});

test("overview uses existing facts and domain summaries without extra requests", () => {
  assert.match(page, /<DataCenterOverview/);
  assert.match(page, /summarizeCalendarMonthProgress/);
  assert.match(page, /summarizeSavedSalaryYear/);
  assert.match(page, /selectCurrentCareerStage/);
  assert.match(overview, /今天[\s\S]*本月[\s\S]*今年/);
  assert.doesNotMatch(overview, /fetch\(|calculateSalary|resolveCalendarDay/);
});

test("all existing tools remain reachable with lower visual priority", () => {
  assert.match(health, /导出 CSV/);
  assert.match(health, /同步与状态/);
  assert.match(calendar, /全年配置/);
  assert.match(calendar, /备注/);
  assert.match(calendar, /编辑日期/);
  assert.match(career, /新增/);
  assert.match(career, /编辑/);
  assert.match(career, /删除/);
  assert.match(salary, /导出 CSV/);
  assert.match(salary, /保存本月/);
});

test("responsive facts layout and compact tools preserve mobile readability", () => {
  assert.match(styles, /\.dataOverviewFacts\{display:grid/);
  assert.match(styles, /@media \(max-width:560px\)[\s\S]*\.dataOverviewFacts/);
  assert.match(styles, /\.dataQuickNav\{overflow-x:auto/);
  assert.match(styles, /:focus-visible/);
});
