import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const page = read("app/features/timeline/TimelinePage.tsx");
const route = read("app/timeline/page.tsx");
const api = read("app/api/timeline/route.ts");
const model = read("app/features/timeline/domain.ts");
const nav = read("app/components/shell/SiteNavigation.tsx");
const styles = read("app/features/timeline/TimelinePage.module.css");

test("timeline route is a read-only derived view with three approved sources", () => {
  assert.match(route, /TimelinePage/);
  assert.match(api, /workExperiences/);
  assert.match(api, /salaryRecords/);
  assert.match(api, /generateAnnualSummaryDraft/);
  assert.match(model, /source: "work_experiences"/);
  assert.match(model, /source: "salary_records"/);
  assert.match(model, /source: summary\.calculationVersion/);
  assert.doesNotMatch(`${api}\n${model}\n${page}`, /financeTransactions|healthDaily|calendarOverrides|POST|PATCH|PUT|DELETE|<form/);
});

test("timeline UI groups years and renders month, career, salary, annual, empty state, and links", () => {
  assert.match(page, /我的时间线/);
  assert.match(page, /groupTimelineItemsByYear/);
  assert.match(page, /String\(item\.month\)\.padStart\(2, "0"\).*月/);
  assert.match(page, /工作经历[\s\S]*工资[\s\S]*年度记录/);
  assert.match(page, /还没有可以放进时间线的记录/);
  assert.match(model, /href: "\/#career"/);
  assert.match(model, /href: "\/#finance"/);
  assert.match(model, /annual=\$\{summary\.year\}#annual/);
  assert.match(nav, /label: "时间线", href: "\/timeline"/);
});

test("timeline layout keeps a restrained index and collapses cleanly on mobile", () => {
  assert.match(styles, /macrostructure: Index-First/);
  assert.match(styles, /grid-template-columns: minmax\(72px, 0\.22fr\) minmax\(0, 1fr\)/);
  assert.match(styles, /grid-template-columns: 64px minmax\(0, 1fr\) auto/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.year \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /grid-template-columns: 46px minmax\(0, 1fr\) 16px/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.doesNotMatch(styles, /position:\s*(fixed|sticky)|overflow-x:\s*(auto|scroll)|transition-all|linear-gradient|radial-gradient/);
});
