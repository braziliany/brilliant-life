"use client";

import { useEffect, useState } from "react";
import {
  explainAnnualDomain,
  type AnnualSummaryDraft,
} from "./domain";
import {
  CompletenessBallotChart,
  FinanceHairlineChart,
  HealthBarcodeChart,
  LifeFinanceDomainChart,
  LifeFinanceMonthlyChart,
  TimeTickDonutChart,
} from "./charts";

type LoadStatus = "loading" | "ready" | "error";

const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centsMoney = (value: number) => money(value / 100);
const shortDate = (value: string) => `${Number(value.slice(5, 7))} 月 ${Number(value.slice(8, 10))} 日`;

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

  return (
    <section className="annualReport" data-annual-summary-source="AnnualSummaryDraft">
      <header className="annualHero">
        <div>
          <h1>我的 {summary.year}</h1>
          <p>{summary.year} 年度档案 · {periodLabel}<br />截至 {summary.asOfDate}</p>
        </div>
        <div className="annualYearSwitcher" aria-label="切换年度">
          <button type="button" onClick={() => setYear((value) => value - 1)} aria-label="上一年">‹</button>
          <strong>{summary.year}</strong>
          <button type="button" onClick={() => setYear((value) => value + 1)} aria-label="下一年">›</button>
        </div>
      </header>

      <div className="annualFacts" aria-label="年度概览">
        <article><span>健康记录</span><strong>{summary.health.coverage.availableDays}</strong><small>/ 截至今日 {summary.health.coverage.expectedDays} 天 · 全年 {summary.health.coverage.fullYearExpectedDays} 天{summary.health.coverage.legacyUnknownDays ? ` · ${summary.health.coverage.legacyUnknownDays} 天为早期记录` : ""}</small></article>
        <article><span>全年步数</span><strong>{summary.health.facts.metricAvailableDays.steps ? number(summary.health.facts.totalSteps) : "—"}</strong><small>{summary.health.facts.metricAvailableDays.steps ? "步" : "没有记录"}</small></article>
        <article><span>全年配置工作日</span><strong>{summary.time.coverage.officialCalendarConfigured ? summary.time.facts.actualWorkdays : "—"}</strong><small>{summary.time.coverage.officialCalendarConfigured ? (summary.time.coverage.includesFutureDates ? "天 · 含未来日期" : "天 · 全年已结束") : "日历未配置"}</small></article>
        <article><span>截至当前已存工资</span><strong>{summary.finance.salary.coverage.availableMonths ? money(summary.finance.salary.facts.totalNetSalary) : "—"}</strong><small>{summary.finance.salary.coverage.availableMonths} / {summary.finance.salary.coverage.expectedMonths} 个已到月份 · 全年范围 {summary.finance.salary.coverage.fullYearExpectedMonths} 月</small></article>
      </div>

      <div className="annualCharts" data-chart-count="6" data-color-system="porcelain">
        <HealthBarcodeChart summary={summary} />
        <TimeTickDonutChart summary={summary} />
        <FinanceHairlineChart summary={summary} />
        <CompletenessBallotChart summary={summary} />
      </div>

      <section className="annualFinance" aria-labelledby="annual-finance-title">
        <div className="annualSectionHead">
          <div><span>FINANCE</span><h2 id="annual-finance-title">这一年的工资与生活收支</h2></div>
          <b>两类记录分别保存，不自动合计</b>
        </div>

        <div className="annualFinanceSources">
          <article>
            <span>工资记录</span>
            {summary.finance.salary.coverage.availableMonths ? <>
              <strong>{money(summary.finance.salary.facts.totalNetSalary)}</strong>
              <small>{summary.finance.salary.facts.savedMonthCount} 个已保存月份 · 个税 {money(summary.finance.salary.facts.totalIncomeTax)}</small>
            </> : <><strong>—</strong><small>这一年暂无已保存工资记录</small></>}
          </article>
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
            <article><span>今年收入</span><strong>{centsMoney(summary.finance.lifeFinance.facts.incomeCents)}</strong><small>实际账单收入</small></article>
            <article><span>净消费</span><strong>{centsMoney(summary.finance.lifeFinance.facts.netExpenseCents)}</strong><small>支出减去退款</small></article>
            <article><span>家庭支出</span><strong>{centsMoney(summary.finance.lifeFinance.facts.familyExpenseCents)}</strong><small>与家庭相关的支出</small></article>
            <article><span>个人消费</span><strong>{centsMoney(summary.finance.lifeFinance.facts.personalExpenseCents)}</strong><small>家庭支出以外的个人净消费</small></article>
          </div>
          <p className="annualFinanceCutoff">年度档案截至 {shortDate(summary.asOfDate)} · 财务记录截至 {shortDate(summary.finance.lifeFinance.facts.dateEnd!)}</p>
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
            </ol> : <p>今年还没有重要支出记录。</p>}
          </section>
        </> : <p className="annualEmpty">暂无财务记录。工资记录仍会独立保留。</p>}
      </section>

      <section className="annualCareer" aria-labelledby="annual-career-title">
        <div className="annualSectionHead"><div><span>CAREER</span><h2 id="annual-career-title">这一年的职业阶段</h2></div><b>{summary.career.facts.stageCount} 段</b></div>
        {summary.career.facts.stages.length ? (
          <ol>
            {summary.career.facts.stages.map((stage) => (
              <li key={stage.id}><i aria-hidden="true" /><div><strong>{stage.role}</strong><span>{stage.company}</span><small>{stage.startMonth} — {stage.endMonth} · {stage.months} 个月</small></div></li>
            ))}
          </ol>
        ) : <p className="annualEmpty">这一年没有与之重叠的职业经历记录。</p>}
      </section>

      <section className="annualTrust" aria-labelledby="annual-trust-title">
        <div className="annualSectionHead"><div><span>记录说明</span><h2 id="annual-trust-title">今年记录得怎么样</h2></div><b>截至 {summary.asOfDate}</b></div>
        <div className="annualTrustGrid">
          {trustRows.map(([label, trust]) => (
            <article key={label}>
              <div><strong>{label}</strong><span>{Math.round(trust.ratio * 100)}%</span></div>
              <p>{trust.state === "complete" ? "完整覆盖" : trust.state === "partial" ? "部分覆盖" : trust.state === "unconfigured" ? "年份未配置" : "没有记录"}</p>
              {trust.warnings.map((warning) => <small key={warning.code}>{warning.explanation}</small>)}
              <footer>{trust.sources.map((source) => source.explanation).join(" · ")}</footer>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
