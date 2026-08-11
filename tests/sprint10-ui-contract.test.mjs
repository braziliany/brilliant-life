import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTimeGreeting } from "../app/components/shell/time-greeting.ts";

const navigation = readFileSync(new URL("../app/components/shell/SiteNavigation.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../app/components/shell/DashboardHeader.tsx", import.meta.url), "utf8");

test("Shanghai time greeting preserves the five factual time periods", () => {
  assert.equal(getTimeGreeting(new Date("2026-08-10T17:00:00Z")), "凌晨");
  assert.equal(getTimeGreeting(new Date("2026-08-10T22:00:00Z")), "早上");
  assert.equal(getTimeGreeting(new Date("2026-08-11T04:00:00Z")), "中午");
  assert.equal(getTimeGreeting(new Date("2026-08-11T07:00:00Z")), "下午");
  assert.equal(getTimeGreeting(new Date("2026-08-11T12:00:00Z")), "晚上");
});

test("top shell contains only the clickable brand", () => {
  assert.match(navigation, /siteBrand/);
  assert.match(navigation, /璀璨人生/);
  assert.doesNotMatch(navigation, /<nav|首页<|数据中心<|年度档案<|siteProfile/);
});

test("welcome header stays personal and non-commercial", () => {
  assert.match(header, /健康、工作、财务与职业档案的当前记录/);
  assert.doesNotMatch(header, /升级计划|Upgrade|AI|评价|建议/);
});
