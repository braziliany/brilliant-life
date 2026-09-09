"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { QianJiExcelAdapter } from "./adapters/qianji-excel";
import { QianJiJsonAdapter } from "./adapters/qianji-json";
import { centsToYuan, LIFE_DOMAIN_LABELS } from "./domain";
import { qianJiValidationSummary, trustedQianJiTransactions } from "./trusted-import";
import type { FinanceImportReport, FinanceImportValidation, FinanceTransactionRecord, LifeDomain } from "./types";

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
type ImportStage = "idle" | "validating" | "ready" | "importing" | "complete" | "error";
const emptyReport = (): FinanceImportReport => ({ read: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 });
const safeImportErrors = [
  "无法读取钱迹文件结构",
  "钱迹文件缺少必要表头",
  "存在缺少账单 ID 的记录",
  "存在重复账单 ID",
  "存在无法识别的交易时间",
  "存在无法识别的金额",
  "存在不支持的交易类型",
  "文件格式不受支持，请选择钱迹 JSON 或 Excel",
  "导入失败，请检查文件或登录状态",
];
const importErrorCopy = (error: unknown, fallback: string) => error instanceof Error && safeImportErrors.includes(error.message) ? error.message : fallback;
const shortDate = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${month} 月 ${day} 日`;
};

function FinanceImportTools({ stage, selectedFile, validation, report, error, inputRef, onSelect, onImport }: {
  stage: ImportStage;
  selectedFile: File | null;
  validation: FinanceImportValidation | null;
  report: FinanceImportReport | null;
  error: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (file: File) => void;
  onImport: () => void;
}) {
  const busy = stage === "validating" || stage === "importing";
  const canImport = Boolean(selectedFile && validation?.valid) && !busy;
  const statusMessage = stage === "validating"
    ? "正在验证账单…"
    : stage === "ready" && validation
      ? qianJiValidationSummary(validation)
      : stage === "importing"
        ? "正在导入账单…"
        : stage === "complete" && report
          ? `导入完成 · 新增 ${report.inserted} · 更新 ${report.updated} · 已存在 ${report.skipped}`
          : "";

  return <div className="financeImportTools" data-state={stage}>
    <div className="financeImportIntro">
      <strong>导入钱迹账单</strong>
      <span>支持钱迹 JSON / Excel</span>
      <p>重复导入会自动补充或更新，不会删除已有记录。</p>
    </div>
    <div className="financeImportSelection" aria-live="polite">
      {selectedFile ? <><small>已选择</small><b title={selectedFile.name}>{selectedFile.name}</b></> : <span>未选择文件</span>}
    </div>
    <div className="financeImportActions">
      <label className="financeFileButton">
        <span>{selectedFile ? "更换文件" : "选择文件"}</span>
        <input
          ref={inputRef}
          className="financeFileInput"
          type="file"
          accept=".json,.xlsx"
          aria-label={selectedFile ? "更换钱迹账单文件" : "选择钱迹账单文件"}
          disabled={busy}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelect(file); }}
        />
      </label>
      <button className="financeImportSubmit" type="button" disabled={!canImport} onClick={onImport}>{stage === "importing" ? "导入中…" : "导入"}</button>
    </div>
    {statusMessage && <span className="financeImportStatus" role="status">{statusMessage}</span>}
    {error && <span className="financeImportError" role="alert">{error}</span>}
  </div>;
}

export function LifeFinancePanel({ active, year }: Props) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<FinanceImportReport | null>(null);
  const [validation, setValidation] = useState<FinanceImportValidation | null>(null);
  const [importError, setImportError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setStatus("loading");
    fetch(`/api/finance?year=${year}&page=1&pageSize=20`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Finance unavailable");
        return response.json() as Promise<{ summary: FinanceSummary }>;
      })
      .then((payload) => { setSummary(payload.summary); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [year]);

  useEffect(() => load(), [load]);

  const selectImportFile = async (file: File) => {
    setSelectedFile(file);
    setImportStage("validating");
    setImportError("");
    setReport(null);
    setValidation(null);
    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".json") && !name.endsWith(".xlsx")) throw new Error("文件格式不受支持，请选择钱迹 JSON 或 Excel");
      const adapter = name.endsWith(".json") ? new QianJiJsonAdapter() : new QianJiExcelAdapter();
      const inspection = adapter instanceof QianJiJsonAdapter ? await adapter.inspect(await file.text()) : await adapter.inspect(await file.arrayBuffer());
      trustedQianJiTransactions(inspection);
      setValidation(inspection);
      setImportStage("ready");
    } catch (error) {
      setImportError(importErrorCopy(error, "无法读取这个文件"));
      setImportStage("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const importSelectedFile = async () => {
    if (!validation?.valid) return;
    setImportStage("importing");
    setImportError("");
    setReport(null);
    try {
      const transactions = trustedQianJiTransactions(validation);
      const combined = emptyReport();
      for (let index = 0; index < transactions.length; index += 200) {
        const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactions: transactions.slice(index, index + 200) }) });
        if (!response.ok) throw new Error("导入失败，请检查文件或登录状态");
        const { report: batch } = await response.json() as { report: FinanceImportReport };
        for (const key of Object.keys(combined) as Array<keyof FinanceImportReport>) combined[key] += batch[key];
      }
      setReport(combined);
      setImportStage("complete");
      load();
    } catch (error) {
      setImportError(importErrorCopy(error, "导入失败，请稍后重试"));
      setImportStage("error");
    }
  };

  const importToolsProps = {
    stage: importStage,
    selectedFile,
    validation,
    report,
    error: importError,
    inputRef,
    onSelect: (file: File) => { void selectImportFile(file); },
    onImport: () => { void importSelectedFile(); },
  };

  const monthlyMax = Math.max(1, ...(summary?.monthly.map((item) => item.netExpenseCents) ?? []));

  return (
    <article id="life-finance" className={`card lifeFinance${active ? " sectionActive" : ""}`}>
      <header className="lifeFinanceHead">
        <div><p className="eyebrow">财务记录</p><h2>{year} 财务记录</h2>{summary && <p>统计截至 {summary.asOfDate}</p>}</div>
      </header>

      {status === "loading" ? <div className="moduleState"><span className="statePulse" /><p>正在读取财务记录…</p></div> : status === "error" ? <div className="moduleState" role="alert"><p>财务记录读取失败。</p><button type="button" onClick={load}>重新加载</button></div> : summary && (
        <>
          <div className="lifeFinanceSummary">
            <div><span>今年收入</span><strong>¥{centsToYuan(summary.incomeCents)}</strong><small>今年收到的收入</small></div>
            <div><span>净消费</span><strong>¥{centsToYuan(summary.netExpenseCents)}</strong><small>支出减去退款</small></div>
            <div><span>家庭支出</span><strong>¥{centsToYuan(summary.familySupportCents)}</strong><small>与家庭相关的支出</small></div>
            <div><span>个人消费</span><strong>¥{centsToYuan(summary.personalExpenseCents)}</strong><small>除家庭支出外的个人净消费</small></div>
          </div>

          {summary.transactionCount === 0 ? <div className="lifeFinanceEmpty"><strong>今年还没有财务记录</strong><span>导入钱迹 JSON 或 Excel 后，这里会显示今年的收支。</span><FinanceImportTools {...importToolsProps} /></div> : (
            <div className="lifeFinanceBody">
              <section className="financeMonths" aria-labelledby="finance-months-title">
                <div><h3 id="finance-months-title">每月净消费</h3><span>{Number(summary.asOfDate.slice(5, 7))} 月 · 截至 {shortDate(summary.asOfDate)}</span></div>
                <div className="financeMonthBars">{summary.monthly.map((item) => <div key={item.month} className={item.month === summary.asOfDate.slice(0, 7) ? "current" : ""}><small>¥{centsToYuan(item.netExpenseCents)}</small><i style={{ height: `${Math.max(6, item.netExpenseCents / monthlyMax * 100)}%` }} /><b>{Number(item.month.slice(5))} 月</b></div>)}</div>
              </section>
              <section className="financeDomains" aria-labelledby="finance-domains-title">
                <h3 id="finance-domains-title">钱投入了哪里</h3>
                <ol>{summary.domains.map((item) => <li key={item.domain}><span>{item.label} · {(item.ratio * 100).toFixed(1)}%</span><strong>¥{centsToYuan(item.amountCents)}</strong><i><b style={{ width: `${item.ratio * 100}%` }} /></i></li>)}</ol>
              </section>
              <section className="financeEvents" aria-labelledby="finance-events-title">
                <div className="financeSectionHead"><h3 id="finance-events-title">重要支出</h3><span>金额较高的支出记录</span></div>
                {summary.significantEvents.length ? <ol>{summary.significantEvents.slice(0, 5).map((item) => { const title = item.note || item.rawSubcategory || item.rawCategory || "支出"; const domain = LIFE_DOMAIN_LABELS[item.lifeDomainOverride ?? item.lifeDomain]; const category = item.rawCategory && item.rawCategory !== title ? item.rawCategory : domain; return <li key={item.id}><time>{item.occurredAt.slice(0, 10)}</time><div><b>{title}</b><small>{category}</small></div><strong>¥{centsToYuan(item.amountCents)}</strong></li>; })}</ol> : <p>今年还没有超过 ¥500.00 的单笔支出。</p>}
              </section>
              <a className="financeTransactionsEntry" href="/finance/transactions" onClick={() => window.history.replaceState(window.history.state, "", "/#life-finance")}>
                <div><h3>查看交易记录</h3><span>查看 {summary.transactionCount.toLocaleString("zh-CN")} 条生活收支记录</span></div><b aria-hidden="true">→</b>
              </a>
              <section className="financeDataTools" aria-label="数据管理"><div className="financeDataToolsHead"><span>数据管理</span><small>导入或更新钱迹记录</small></div><FinanceImportTools {...importToolsProps} /></section>
            </div>
          )}
        </>
      )}
    </article>
  );
}
