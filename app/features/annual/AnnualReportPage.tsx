"use client";

import { useEffect, useState } from "react";
import {
  explainAnnualDomain,
  type AnnualSummaryDraft,
} from "./domain";
import {
  FinanceHairlineChart,
  HealthBarcodeChart,
  LifeFinanceDomainChart,
  LifeFinanceMonthlyChart,
  TimeTickDonutChart,
} from "./charts";
import type { LifeInsight } from "../insights/types";

type LoadStatus = "loading" | "ready" | "error";

const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centsMoney = (value: number) => money(value / 100);
const shortDate = (value: string) => `${Number(value.slice(5, 7))} 月 ${Number(value.slice(8, 10))} 日`;
const shortMonth = (value: string) => `${Number(value.slice(5, 7))} 月`;

function AnnualInsightItem({ insight }: { insight: LifeInsight }) {
  if (insight.id === "health-workday-steps" || insight.id === "health-workday-exercise") {
    const label = insight.id === "health-workday-steps" ? "步数" : "锻炼时间";
    if (!insight.value) return <article><span>健康与工作时间</span><h3>{label}记录还不够比较</h3><p>{insight.explanation}</p></article>;
    const difference = insight.value.difference;
    const differenceText = difference === 0
      ? `两类日期的平均${label}相同`
      : difference > 0
        ? `工作日平均多 ${number(Math.abs(difference))} ${insight.unit}`
        : `非工作日平均多 ${number(Math.abs(difference))} ${insight.unit}`;
    return <article>
      <span>健康与工作时间</span>
      <h3>工作日平均 {number(insight.value.workdayAverage)} {insight.unit}</h3>
      <p>非工作日平均 {number(insight.value.nonWorkdayAverage)} {insight.unit} · {differenceText}</p>
      <small>{insight.value.workdayDays} 个工作日 · {insight.value.nonWorkdayDays} 个非工作日{insight.availability === "partial" ? " · 记录覆盖部分日期" : ""}</small>
    </article>;
  }
  if (insight.id === "life-finance-cash-flow") {
    return <article>
      <span>生活收支</span>
      <h3>账单现金流结余</h3>
      {insight.value ? <>
        <strong>{centsMoney(insight.value.balanceCents)}</strong>
        <p>账单收入 {centsMoney(insight.value.incomeCents)} · 净消费 {centsMoney(insight.value.netExpenseCents)}</p>
      </> : <p>{insight.explanation}</p>}
      <small>{insight.value && insight.period.start && insight.period.end ? `${shortDate(insight.period.start)} — ${shortDate(insight.period.end)} · ` : ""}{insight.explanation}</small>
    </article>;
  }
  return <article>
    <span>工资记录</span>
    <h3>{insight.value ? `已保存 ${insight.value.savedMonthCount} 个月工资记录` : insight.coverage.available ? "工资记录还不足以形成趋势" : "这一年还没有工资记录"}</h3>
    {insight.value ? <>
      <strong>{insight.value.difference === 0 ? "最早与最新记录的工资相同" : `最新记录的工资比最早记录${insight.value.difference > 0 ? "高" : "低"} ${money(Math.abs(insight.value.difference))}`}</strong>
      <p>{shortMonth(insight.value.firstMonth)} {money(insight.value.firstNetSalary)} · {shortMonth(insight.value.latestMonth)} {money(insight.value.latestNetSalary)}</p>
    </> : <p>{insight.explanation}</p>}
    <small>只比较已保存的工资记录，不包含预计工资</small>
  </article>;
}

export function AnnualReportPage({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);
  const [summary, setSummary] = useState<AnnualSummaryDraft | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setSummary(null);
    fetch(`/api/annual?year=${year}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Annual summary unavailable");
        return response.json() as Promise<{ summary: AnnualSummaryDraft }>;
      })
      .then(({ summary: nextSummary }) => {
        setSummary(nextSummary);
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [year, reloadKey]);

  if (status === "loading") {
    return <section className="annualReport annualLoading" aria-live="polite"><span className="statePulse" />正在整理 {year} 年记录…</section>;
  }
  if (status === "error" || !summary) {
    return <section className="annualReport annualLoading" aria-live="polite"><p>年度记录读取失败。</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></section>;
  }

  return <AnnualArchiveContent summary={summary} onChangeYear={setYear} />;
}

export function AnnualArchiveContent({ summary, onChangeYear }: { summary: AnnualSummaryDraft; onChangeYear: (year: number) => void }) {
  const healthTrust = explainAnnualDomain(summary.health);
  const timeTrust = explainAnnualDomain(summary.time);
  const salaryTrust = explainAnnualDomain(summary.finance.salary);
  const lifeFinanceTrust = explainAnnualDomain(summary.finance.lifeFinance);
  const careerTrust = explainAnnualDomain(summary.career);
  const trustRows = [
    ["健康", healthTrust],
    ["时间", timeTrust],
    ["工资", salaryTrust],
    ["财务", lifeFinanceTrust],
    ["职业", careerTrust],
  ] as const;
  const periodLabel = summary.periodStatus === "in-progress" ? "进行中" : summary.periodStatus === "not-started" ? "尚未开始" : "已结束";
  const healthMetrics = [
    ["steps", "已记录步数", number(summary.health.facts.totalSteps), "步"],
    ["exerciseMinutes", "已记录锻炼时间", number(summary.health.facts.totalExerciseMinutes), "分钟"],
    ["sleepMinutes", "平均睡眠", summary.health.facts.sleep.averageMinutes === null ? null : number(summary.health.facts.sleep.averageMinutes), "分钟"],
    ["weightKg", "最新记录体重", summary.health.facts.weight.lastKg === null ? null : number(summary.health.facts.weight.lastKg), "kg"],
    ["restingHeartRateBpm", "平均静息心率", summary.health.facts.restingHeartRate.averageBpm === null ? null : number(summary.health.facts.restingHeartRate.averageBpm), "次 / 分钟"],
  ] as const;
  // Existing aggregate facts can include legacy observations; never label a mixed aggregate as trusted.
  const trustedMetric = (metric: typeof healthMetrics[number][0]) => summary.health.coverage.legacyUnknownDays === 0 && summary.health.facts.metricAvailableDays[metric] > 0 && summary.health.facts.trustedMetricAvailableDays[metric] >= summary.health.facts.metricAvailableDays[metric];
  const visibleInsights = summary.insights.slice(0, 4).filter((insight) => insight.availability !== "unavailable" && insight.value !== null);

  return (
    <section className="annualReport" data-annual-summary-source="AnnualSummaryDraft">
      <header className="annualHero">
        <div>
          <h1>我的 {summary.year}</h1>
          <p>{summary.year} 年度档案 · {periodLabel}<br />{summary.periodStatus === "complete" ? `${summary.year}-01-01 — ${summary.year}-12-31` : `截至 ${summary.asOfDate}`}</p>
        </div>
        <div className="annualYearSwitcher" aria-label="切换年度">
          <button type="button" onClick={() => onChangeYear(summary.year - 1)} aria-label="上一年">‹</button>
          <strong>{summary.year}</strong>
          <button type="button" onClick={() => onChangeYear(summary.year + 1)} aria-label="下一年">›</button>
        </div>
      </header>

      <section className="annualHealth" data-annual-section="health" aria-labelledby="annual-health-title">
        <div className="annualSectionHead"><div><span>健康</span><h2 id="annual-health-title">这一年的健康记录</h2></div></div>
        <p>{summary.health.coverage.availableDays ? `${summary.health.coverage.availableDays} 个日期有记录` : "这一年暂无健康记录。"}{summary.health.coverage.legacyUnknownDays ? ` · ${summary.health.coverage.legacyUnknownDays} 天为早期记录，指标是否完整尚不能确认` : ""}</p>
        {summary.health.coverage.availableDays > 0 && <div className="annualFacts" aria-label="健康记录摘要">
          {healthMetrics.map(([metric, label, value, unit]) => <article key={metric}><span>{label}</span><strong>{trustedMetric(metric) && value !== null ? value : "—"}</strong><small>{trustedMetric(metric) && value !== null ? `${unit} · ${summary.health.facts.metricAvailableDays[metric]} 天有可信记录` : "暂无可确认的汇总"}</small></article>)}
        </div>}
        {trustedMetric("steps") && <div className="annualCharts"><HealthBarcodeChart summary={summary} /></div>}
      </section>

      <section className="annualCareer" data-annual-section="career" aria-labelledby="annual-career-title">
        <div className="annualSectionHead"><div><span>职业</span><h2 id="annual-career-title">这一年的职业阶段</h2></div><b>{summary.career.facts.stageCount} 段</b></div>
        {summary.career.facts.stages.length ? <ol>{summary.career.facts.stages.map((stage) => <li key={stage.id}><i aria-hidden="true" /><div><strong>{stage.role}</strong><span>{stage.company}</span><small>年内记录范围 {stage.startMonth} — {stage.endMonth} · {stage.months} 个月</small></div></li>)}</ol> : <p className="annualEmpty">这一年没有与之重叠的职业经历记录。</p>}
      </section>

      <section className="annualSalary" data-annual-section="salary" aria-labelledby="annual-salary-title">
        <div className="annualSectionHead"><div><span>工资</span><h2 id="annual-salary-title">这一年已保存的工资</h2></div></div>
        {summary.finance.salary.coverage.availableMonths ? <>
          <div className="annualFinanceSources"><article><span>累计工资</span><strong>{money(summary.finance.salary.facts.totalNetSalary)}</strong><small>{summary.finance.salary.facts.savedMonthCount} 个已保存月份 · 个税 {money(summary.finance.salary.facts.totalIncomeTax)}</small></article></div>
          <p>只包含已保存月份，不包含预计工资，也不会随当前工资规则自动重算。</p>
          <div className="annualCharts"><FinanceHairlineChart summary={summary} /></div>
        </> : <p className="annualEmpty">这一年暂无已保存工资记录。</p>}
      </section>

      <section className="annualFinance" data-annual-section="life-finance" aria-labelledby="annual-finance-title">
        <div className="annualSectionHead">
          <div><span>财务记录</span><h2 id="annual-finance-title">这一年的生活收支</h2></div>
          <b>两类记录分别保存，不自动合计</b>
        </div>

        <div className="annualFinanceSources">
          <article>
            <span>生活收支</span>
            {summary.finance.lifeFinance.facts.recordCount ? <>
              <strong>{summary.finance.lifeFinance.facts.recordCount.toLocaleString("zh-CN")} 条</strong>
              <small>{summary.finance.lifeFinance.facts.dateStart} — {summary.finance.lifeFinance.facts.dateEnd} · 钱迹导入</small>
            </> : <><strong>—</strong><small>这一年暂无财务记录</small></>}
          </article>
        </div>

        {summary.finance.lifeFinance.facts.recordCount ? <>
          <div className="annualLifeFinanceMetrics" aria-label="年度生活收支摘要">
            <article><span>年度账单收入</span><strong>{centsMoney(summary.finance.lifeFinance.facts.incomeCents)}</strong><small>实际账单收入</small></article>
            <article><span>支出</span><strong>{centsMoney(summary.finance.lifeFinance.facts.grossExpenseCents)}</strong><small>退款前的账单支出</small></article>
            <article><span>退款</span><strong>{centsMoney(summary.finance.lifeFinance.facts.refundsCents)}</strong><small>账单退款</small></article>
            <article><span>净消费</span><strong>{centsMoney(summary.finance.lifeFinance.facts.netExpenseCents)}</strong><small>支出减去退款</small></article>
            <article><span>家庭支出</span><strong>{centsMoney(summary.finance.lifeFinance.facts.familyExpenseCents)}</strong><small>与家庭相关的支出</small></article>
            <article><span>个人消费</span><strong>{centsMoney(summary.finance.lifeFinance.facts.personalExpenseCents)}</strong><small>家庭支出以外的个人净消费</small></article>
          </div>
          <p className="annualFinanceCutoff">{summary.periodStatus === "complete" ? `${summary.year} 全年范围` : `年度档案截至 ${shortDate(summary.asOfDate)}`} · 财务记录截至 {shortDate(summary.finance.lifeFinance.facts.dateEnd!)}</p>
          <div className="annualLifeFinanceCharts" data-color-system="porcelain">
            <LifeFinanceMonthlyChart summary={summary} />
            <LifeFinanceDomainChart summary={summary} />
          </div>
          <section className="annualImportantExpenses" aria-labelledby="annual-important-expenses-title">
            <div><h3 id="annual-important-expenses-title">重要支出</h3><span>金额较高的支出记录</span></div>
            {summary.finance.lifeFinance.facts.importantExpenses.length ? <ol>
              {summary.finance.lifeFinance.facts.importantExpenses.map((item, index) => <li key={`${item.date}-${item.title}-${item.amountCents}-${index}`}>
                <time>{item.date}</time><div><strong>{item.title}</strong><small>{item.category}</small></div><b>{centsMoney(item.amountCents)}</b>
              </li>)}
            </ol> : <p>这一年还没有重要支出记录。</p>}
          </section>
        </> : <p className="annualEmpty">暂无财务记录。工资记录仍会独立保留。</p>}
      </section>

      <section className="annualTime" data-annual-section="time" aria-labelledby="annual-time-title">
        <div className="annualSectionHead"><div><span>时间</span><h2 id="annual-time-title">这一年的日历安排</h2></div></div>
        <p>这是全年日历配置，不代表已经完成的工作或休息。{summary.time.coverage.includesFutureDates ? "包含未来日期。" : ""}</p>
        {summary.time.coverage.officialCalendarConfigured ? <div className="annualCharts"><TimeTickDonutChart summary={summary} /></div> : <p className="annualEmpty">这一年份未配置日历。</p>}
      </section>

      <section className="annualInsights" data-annual-section="insights" aria-labelledby="annual-insights-title">
        <div className="annualSectionHead"><div><span>记录比较</span><h2 id="annual-insights-title">这一年的记录与比较</h2></div></div>
        {visibleInsights.length ? <div className="annualInsightsGrid">{visibleInsights.map((insight) => <AnnualInsightItem key={insight.id} insight={insight} />)}</div> : <p className="annualEmpty">现有记录还不足以进行比较。</p>}
      </section>

      <section className="annualTrust" data-annual-section="coverage" aria-labelledby="annual-trust-title">
        <div className="annualSectionHead"><div><span>记录说明</span><h2 id="annual-trust-title">这一年的记录覆盖</h2></div>{summary.periodStatus === "complete" ? <b>{summary.year} 全年范围</b> : <b>截至 {summary.asOfDate}</b>}</div>
        <p>缺失记录不计为零。工资与财务只展示已有记录；职业经历不要求每个月都有新事件。</p>
        <details className="annualRecordDetails"><summary>记录说明与来源</summary>
        <p>健康范围 {summary.health.coverage.expectedDays} 天 / 全年 {summary.health.coverage.fullYearExpectedDays} 天；工资范围 {summary.finance.salary.coverage.expectedMonths} 个月。</p>
        <div className="annualTrustGrid">
          {trustRows.map(([label, trust]) => (
            <article key={label}>
              <div><strong>{label}</strong>{label !== "职业" && <span>{Math.round(trust.ratio * 100)}%</span>}</div>
              <p>{label === "职业" ? "按经历起止月份记录" : trust.state === "complete" ? "完整覆盖" : trust.state === "partial" ? "部分覆盖" : trust.state === "unconfigured" ? "年份未配置" : "没有记录"}</p>
              {trust.warnings.filter((warning) => label !== "职业" || warning.code !== "partial-career-year").map((warning) => <small key={warning.code}>{warning.explanation}</small>)}
              <footer>{trust.sources.map((source) => source.explanation).join(" · ")}</footer>
            </article>
          ))}
        </div>
        </details>
      </section>
    </section>
  );
}
