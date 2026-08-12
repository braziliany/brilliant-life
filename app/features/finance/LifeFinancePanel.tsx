"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QianJiExcelAdapter } from "./adapters/qianji-excel";
import { QianJiJsonAdapter } from "./adapters/qianji-json";
import { centsToYuan } from "./domain";
import type { FinanceImportReport, FinanceTransactionRecord, LifeDomain } from "./types";

type FinanceSummary = {
  year: number;
  asOfDate: string;
  transactionCount: number;
  incomeCents: number;
  expenseCents: number;
  refundCents: number;
  netExpenseCents: number;
  familySupportCents: number;
  personalExpenseCents: number;
  monthly: Array<{ month: string; netExpenseCents: number }>;
  domains: Array<{ domain: LifeDomain; label: string; amountCents: number; ratio: number }>;
  significantEvents: FinanceTransactionRecord[];
};

type Props = { active: boolean; year: number };
type LoadStatus = "loading" | "ready" | "error";

const emptyReport = (): FinanceImportReport => ({ read: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 });

export function LifeFinancePanel({ active, year }: Props) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<FinanceImportReport | null>(null);
  const [importError, setImportError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setStatus("loading");
    fetch(`/api/finance?year=${year}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Finance unavailable");
        return response.json() as Promise<{ summary: FinanceSummary }>;
      })
      .then((payload) => { setSummary(payload.summary); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [year]);

  useEffect(() => load(), [load]);

  const importFile = async (file: File) => {
    setImporting(true);
    setImportError("");
    setReport(null);
    try {
      const adapter = file.name.toLowerCase().endsWith(".json") ? new QianJiJsonAdapter() : new QianJiExcelAdapter();
      const transactions = adapter instanceof QianJiJsonAdapter ? await adapter.parse(await file.text()) : await adapter.parse(await file.arrayBuffer());
      if (!transactions.length) throw new Error("没有读取到受支持的钱迹记录");
      const combined = emptyReport();
      for (let index = 0; index < transactions.length; index += 200) {
        const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactions: transactions.slice(index, index + 200) }) });
        if (!response.ok) throw new Error("导入失败，请检查文件或登录状态");
        const { report: batch } = await response.json() as { report: FinanceImportReport };
        for (const key of Object.keys(combined) as Array<keyof FinanceImportReport>) combined[key] += batch[key];
      }
      setReport(combined);
      load();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const monthlyMax = Math.max(1, ...(summary?.monthly.map((item) => item.netExpenseCents) ?? []));

  return (
    <article id="life-finance" className={`card lifeFinance${active ? " sectionActive" : ""}`}>
      <header className="lifeFinanceHead">
        <div><p className="eyebrow">LIFE FINANCE · 生命财务</p><h2>{year} 财务轨迹</h2><p>看看今年的钱流向了怎样的生活</p></div>
        <details className="financeImportTools">
          <summary>导入财务数据</summary>
          <div>
            <p>支持钱迹 JSON 与 Excel。重复导入会补充或更新，不会删除记录。</p>
            <input ref={inputRef} type="file" accept=".json,.xlsx" disabled={importing} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
            {importing && <span>正在读取并导入…</span>}
          </div>
        </details>
      </header>

      {report && <div className="financeImportReport" role="status">读取 {report.read} 条 · 新增 {report.inserted} · 更新 {report.updated} · 已存在 {report.skipped} · 失败 {report.failed}</div>}
      {importError && <div className="financeImportError" role="alert">{importError}</div>}

      {status === "loading" ? <div className="moduleState"><span className="statePulse" /><p>正在读取财务记录…</p></div> : status === "error" ? <div className="moduleState" role="alert"><p>财务记录读取失败。</p><button type="button" onClick={load}>重新加载</button></div> : summary && (
        <>
          <div className="lifeFinanceSummary">
            <div><span>收入</span><strong>¥{centsToYuan(summary.incomeCents)}</strong><small>截至 {summary.asOfDate}</small></div>
            <div><span>净消费</span><strong>¥{centsToYuan(summary.netExpenseCents)}</strong><small>支出减去退款</small></div>
            <div><span>家庭支持</span><strong>¥{centsToYuan(summary.familySupportCents)}</strong><small>家庭相关记录</small></div>
            <div><span>个人消费</span><strong>¥{centsToYuan(summary.personalExpenseCents)}</strong><small>净消费减去家庭支持</small></div>
          </div>

          {summary.transactionCount === 0 ? <div className="lifeFinanceEmpty"><strong>今年还没有财务记录</strong><span>导入钱迹 JSON 或 Excel 后，这里会出现年度轨迹。</span></div> : (
            <div className="lifeFinanceBody">
              <section className="financeMonths" aria-labelledby="finance-months-title">
                <div><h3 id="finance-months-title">每月记录</h3><span>{summary.asOfDate.slice(0, 7)} 进行中</span></div>
                <div className="financeMonthBars">{summary.monthly.map((item) => <div key={item.month}><i style={{ height: `${Math.max(6, item.netExpenseCents / monthlyMax * 100)}%` }} /><b>{Number(item.month.slice(5))}月</b><small>¥{centsToYuan(item.netExpenseCents)}</small></div>)}</div>
              </section>
              <section className="financeDomains" aria-labelledby="finance-domains-title">
                <h3 id="finance-domains-title">钱投入了哪里</h3>
                <ol>{summary.domains.map((item) => <li key={item.domain}><span>{item.label}</span><i><b style={{ width: `${item.ratio * 100}%` }} /></i><strong>¥{centsToYuan(item.amountCents)}</strong><small>{(item.ratio * 100).toFixed(1)}%</small></li>)}</ol>
              </section>
              <section className="financeEvents" aria-labelledby="finance-events-title">
                <h3 id="finance-events-title">重要支出</h3>
                {summary.significantEvents.length ? <ol>{summary.significantEvents.slice(0, 8).map((item) => <li key={item.id}><time>{item.occurredAt.slice(0, 10)}</time><div><b>{item.note || item.rawSubcategory || item.rawCategory || "支出"}</b><small>{item.rawCategory} · 来源：钱迹</small></div><strong>¥{centsToYuan(item.amountCents)}</strong></li>)}</ol> : <p>今年还没有超过 ¥500.00 的单笔支出。</p>}
              </section>
            </div>
          )}
        </>
      )}
    </article>
  );
}
