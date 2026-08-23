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
const dailyGoals = read("app/features/health/DailyGoalsColumn.tsx");
const calendar = read("app/features/calendar/WorkCalendarCard.tsx");
const career = read("app/features/career/WorkExperienceTimeline.tsx");
const salary = read("app/features/salary/SalaryDashboard.tsx");
const annualPage = read("app/features/annual/AnnualReportPage.tsx");
const annualCharts = read("app/features/annual/charts.tsx");
const lifeFinance = read("app/features/finance/LifeFinancePanel.tsx");
const styles = read("app/globals.css");

test("data center exposes overview and life domains", () => {
  assert.match(nav, /data-overview[\s\S]*总览/);
  assert.match(nav, /health[\s\S]*健康/);
  assert.match(nav, /time[\s\S]*时间/);
  assert.match(nav, /career[\s\S]*职业/);
  assert.match(nav, /finance[\s\S]*财务/);
  assert.match(nav, /life-finance[\s\S]*财务记录/);
  assert.doesNotMatch(nav, /每日目标|工作经历/);
});

test("overview uses existing facts and domain summaries without extra requests", () => {
  assert.match(page, /<DataCenterOverview/);
  assert.match(page, /summarizeCalendarMonthProgress/);
  assert.match(page, /summarizeSavedSalaryYear/);
  assert.match(page, /selectCurrentCareerStage/);
  assert.match(overview, /今天[\s\S]*本月[\s\S]*今年/);
  assert.match(overview, /FINANCE · 今年工资[\s\S]*已保存 \$\{savedSalaryMonths\} 个月工资记录/);
  assert.doesNotMatch(overview, /今年已保存/);
  assert.doesNotMatch(overview, /fetch\(|calculateSalary|resolveCalendarDay/);
});

test("production UI keeps internal fact terminology out of personal archive copy", () => {
  const productionCopy = [overview, health, calendar, career, salary, annualPage, annualCharts, lifeFinance].join("\n");
  assert.doesNotMatch(productionCopy, /事实层|事实摘要|生活事实|工资事实|健康事实|日历事实|实时草稿|健康档案|时间档案|职业档案|月度档案/);
  assert.match(overview, /最近记录/);
  assert.match(health, /今日健康|健康趋势/);
  assert.match(salary, /工资记录/);
});

test("health UI shows server-proven sync state without turning missing data into zero", () => {
  assert.match(health, /healthLastSync[\s\S]*最后同步[\s\S]*今日尚未同步/);
  assert.match(health, /activeEnergy\?\.toLocaleString[\s\S]*\?\? "—"/);
  assert.match(dailyGoals, /steps === null \? "—"/);
  assert.match(dailyGoals, /stepProgress === null \? "—"/);
  assert.match(dailyGoals, /今日尚未同步[\s\S]*暂无步数记录/);
});

test("life finance presents personal records with secondary data management", () => {
  assert.match(lifeFinance, /财务记录[\s\S]*统计截至/);
  assert.match(lifeFinance, /今年收入[\s\S]*净消费[\s\S]*家庭支出[\s\S]*个人消费/);
  assert.match(lifeFinance, /每月净消费[\s\S]*月 · 截至/);
  assert.match(lifeFinance, /金额较高的支出记录/);
  assert.doesNotMatch(lifeFinance, /\{category\} · 钱迹/);
  assert.match(lifeFinance, /financeDataTools[\s\S]*数据管理/);
  assert.match(lifeFinance, /<summary>导入数据<\/summary>/);
  assert.doesNotMatch(lifeFinance, /生命财务|财务轨迹|资源投入|这些钱意味着什么|来源：钱迹|每月记录/);
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

test("salary history emphasizes saved net pay and keeps full details expandable", () => {
  assert.match(salary, /本月预计实发[\s\S]*按当前工作日历计算/);
  assert.doesNotMatch(salary, /当前日历预计实发|今年已保存/);
  assert.match(salary, /<details className=\{`salaryRecord/);
  assert.match(salary, /<span>实发<\/span><strong>¥\{money\(record\.netSalary\)\}<\/strong>/);
  assert.doesNotMatch(salary, /已保存实发/);
  assert.doesNotMatch(salary, /仅工资快照|实时计算/);
  assert.match(salary, /salaryRecordDetails[\s\S]*应发[\s\S]*固定扣除[\s\S]*请假扣款[\s\S]*个税[\s\S]*额外收入[\s\S]*奖金/);
});

test("responsive facts layout and compact tools preserve mobile readability", () => {
  assert.match(styles, /\.dataOverviewFacts\{display:grid/);
  assert.match(styles, /@media \(max-width:560px\)[\s\S]*\.dataOverviewFacts/);
  assert.match(styles, /\.dataQuickNav\{overflow-x:auto/);
  assert.match(styles, /\.moduleTools:not\(\[open\]\)>div\{display:none\}/);
  assert.match(styles, /\.dashboard\{width:100%;min-width:0;max-width:100%/);
  assert.match(styles, /:focus-visible/);
});

test("calendar today accent is purple and overrides ordinary day indicators", () => {
  assert.match(styles, /\.days>button\.today:before\{background:#c28cff\}/);
  assert.match(styles, /\.calendarLegend \.todayLine\{background:#c28cff\}/);
  assert.ok(
    styles.lastIndexOf(".days>button.today:before{background:#c28cff}") >
      styles.indexOf(".days>button.workday:before"),
  );
});
