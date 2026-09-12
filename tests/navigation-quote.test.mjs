import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  GENSHIN_QUOTE_POOLS,
  resolveGenshinMajorSeries,
  selectGenshinQuote,
  toShanghaiNaturalDate,
} from "../app/features/home/genshin-quote.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const navigation = read("app/components/shell/SiteNavigation.tsx");
const home = read("app/components/home/HomePage.tsx");
const page = read("app/page.tsx");
const styles = read("app/globals.css");

test("formal navigation exposes every approved destination in fixed order", () => {
  const entries = [
    ["home", "首页", "/"],
    ["health", "健康", "/#health"],
    ["time", "时间", "/#time"],
    ["career", "职业", "/#career"],
    ["finance-records", "财务记录", "/#life-finance"],
    ["salary", "工资", "/#finance"],
    ["annual", "年度档案", "/#annual"],
    ["timeline", "时间线", "/timeline"],
  ];
  let cursor = -1;
  for (const [key, label, href] of entries) {
    const next = navigation.indexOf(`{ key: "${key}", label: "${label}", href: "${href}" }`);
    assert.ok(next > cursor, `${label} stays in the approved navigation order`);
    cursor = next;
  }
  assert.match(navigation, /aria-current=\{activePage === item\.key \? "page" : undefined\}/);
  assert.match(page, /setActiveSection\("data-overview"\);\s*setSitePage\("home"\);/);
});

test("desktop keeps the formal navigation while mobile keeps only the brand", () => {
  assert.match(navigation, /<details className="primaryNavigation">[\s\S]*<summary>导航/);
  assert.equal((navigation.match(/<nav aria-label="主要导航">/g) ?? []).length, 1);
  assert.match(styles, /\.primaryNavigation>summary\{display:none\}/);
  assert.match(styles, /@media \(max-width:900px\)\{[\s\S]*\.siteNavigation\{height:auto;min-height:0;margin-bottom:12px;flex-wrap:nowrap\}[\s\S]*\.primaryNavigation\{display:none\}/);
  assert.doesNotMatch(styles, /@media \(max-width:900px\)[\s\S]*\.primaryNavigation\[open\]>nav\{display:grid/);
  assert.match(styles, /html,body \{ overflow-x:clip; \}/);
});

test("legacy homepage domain navigation is removed without hidden residue", () => {
  assert.equal(existsSync(resolve(root, "app/components/shell/DataQuickNav.tsx")), false);
  assert.doesNotMatch(page, /DataQuickNav|数据中心模块快捷导航/);
  assert.doesNotMatch(styles, /dataQuickNav/);
});

test("confirmed main-series windows map to previous-major quote pools", () => {
  assert.equal(resolveGenshinMajorSeries("2026-01-15"), "6.x");
  assert.equal(selectGenshinQuote(new Date("2026-01-15T04:00:00Z")).majorSeries, "5.x");
  assert.equal(resolveGenshinMajorSeries("2026-09-11"), "7.x");
  assert.equal(selectGenshinQuote(new Date("2026-09-11T04:00:00Z")).majorSeries, "6.x");
});

test("Asia Shanghai natural date controls stable deterministic selection", () => {
  assert.equal(toShanghaiNaturalDate(new Date("2026-08-11T15:59:59Z")), "2026-08-11");
  assert.equal(toShanghaiNaturalDate(new Date("2026-08-11T16:00:00Z")), "2026-08-12");
  const morning = selectGenshinQuote(new Date("2026-09-10T00:00:00Z"));
  const evening = selectGenshinQuote(new Date("2026-09-10T14:00:00Z"));
  const nextDay = selectGenshinQuote(new Date("2026-09-11T04:00:00Z"));
  assert.deepEqual(morning, evening);
  assert.notDeepEqual(morning, nextDay);
});

test("quote attribution is preserved and unknown future dates fall back safely", () => {
  const future = selectGenshinQuote(new Date("2099-01-01T00:00:00Z"));
  assert.equal(future.majorSeries, "6.x");
  assert.ok(GENSHIN_QUOTE_POOLS["6.x"].some(({ text, speaker }) => text === future.text && speaker === future.speaker));
  assert.ok(future.speaker.length > 0);
});

test("homepage renders only speaker and quote-series attribution", () => {
  assert.match(home, /— \{dailyQuote\.speaker\} ·《原神》\{dailyQuote\.majorSeries\}/);
  assert.doesNotMatch(home, /每日一言|上一版本|当前版本/);
  assert.match(styles, /\.homeHero \.dailyQuote,\.homeHero \.quoteSource\{min-width:0;overflow-wrap:anywhere\}/);
});
