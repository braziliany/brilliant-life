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
  TimeTickDonutChart,
} from "./charts";

type LoadStatus = "loading" | "ready" | "error";

const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    return <section className="annualReport annualLoading" aria-live="polite"><span className="statePulse" />正在整理 {year} 年度档案…</section>;
  }
  if (status === "error" || !summary) {
    return <section className="annualReport annualLoading" aria-live="polite"><p>年度档案读取失败。</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></section>;
  }

  const healthTrust = explainAnnualDomain(summary.health);
  const timeTrust = explainAnnualDomain(summary.time);
  const financeTrust = explainAnnualDomain(summary.finance);
  const careerTrust = explainAnnualDomain(summary.career);
  const trustRows = [
    ["健康", healthTrust],
    ["时间", timeTrust],
    ["财务", financeTrust],
    ["职业", careerTrust],
  ] as const;
  const periodLabel = summary.periodStatus === "in-progress" ? "进行中" : summary.periodStatus === "not-started" ? "尚未开始" : "已结束";

  return (
    <section className="annualReport" data-annual-summary-source="AnnualSummaryDraft">
      <header className="annualHero">
        <div>
          <p className="annualKicker">个人数字生命档案 · 实时草稿</p>
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
        <article><span>健康记录</span><strong>{summary.health.coverage.availableDays}</strong><small>/ 截至今日 {summary.health.coverage.expectedDays} 天 · 全年 {summary.health.coverage.fullYearExpectedDays} 天</small></article>
        <article><span>全年步数</span><strong>{summary.health.coverage.availableDays ? number(summary.health.facts.totalSteps) : "—"}</strong><small>{summary.health.coverage.availableDays ? "步" : "没有记录"}</small></article>
        <article><span>全年配置工作日</span><strong>{summary.time.coverage.officialCalendarConfigured ? summary.time.facts.actualWorkdays : "—"}</strong><small>{summary.time.coverage.officialCalendarConfigured ? (summary.time.coverage.includesFutureDates ? "天 · 含未来日期" : "天 · 全年已结束") : "日历未配置"}</small></article>
        <article><span>截至当前已存工资</span><strong>{summary.finance.coverage.availableMonths ? money(summary.finance.facts.totalNetSalary) : "—"}</strong><small>{summary.finance.coverage.availableMonths} / {summary.finance.coverage.expectedMonths} 个已到月份 · 全年范围 {summary.finance.coverage.fullYearExpectedMonths} 月</small></article>
      </div>

      <div className="annualCharts" data-chart-count="4" data-color-system="porcelain">
        <HealthBarcodeChart summary={summary} />
        <TimeTickDonutChart summary={summary} />
        <FinanceHairlineChart summary={summary} />
        <CompletenessBallotChart summary={summary} />
      </div>

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
        <div className="annualSectionHead"><div><span>TRUST</span><h2 id="annual-trust-title">数据完整度与说明</h2></div><b>{summary.calculationVersion}</b></div>
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
