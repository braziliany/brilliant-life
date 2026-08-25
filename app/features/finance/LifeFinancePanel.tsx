"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { QianJiExcelAdapter } from "./adapters/qianji-excel";
import { QianJiJsonAdapter } from "./adapters/qianji-json";
import { centsToYuan, LIFE_DOMAIN_LABELS, resolveFinancePageForYear } from "./domain";
import type { FinanceImportReport, FinanceTransactionAuditView, FinanceTransactionRecord, FinanceTransactionType, LifeDomain } from "./types";

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
type TransactionPage = { items: FinanceTransactionAuditView[]; page: number; pageSize: number; total: number; totalPages: number };

const FINANCE_TYPE_LABELS: Record<FinanceTransactionType, string> = {
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
  repayment: "还款",
};

const SOURCE_LABELS: Record<string, string> = { qianji: "钱迹", "annual-preview-synthetic": "本地合成预览" };

const emptyReport = (): FinanceImportReport => ({ read: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 });
const shortDate = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${month} 月 ${day} 日`;
};

function FinanceImportTools({ importing, inputRef, onImport }: { importing: boolean; inputRef: RefObject<HTMLInputElement | null>; onImport: (file: File) => void }) {
  return <details className="financeImportTools">
    <summary>导入数据</summary>
    <div>
      <p>支持钱迹 JSON 与 Excel。重复导入会补充或更新，不会删除记录。</p>
      <input ref={inputRef} type="file" accept=".json,.xlsx" disabled={importing} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); }} />
      {importing && <span>正在读取并导入…</span>}
    </div>
  </details>;
}

export function LifeFinancePanel({ active, year }: Props) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionPage | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransactionAuditView | null>(null);
  const [pagination, setPagination] = useState(() => ({ year, page: 1 }));
  const page = resolveFinancePageForYear(pagination.year, year, pagination.page);
  const setPage = (update: number | ((currentPage: number) => number)) => setPagination((current) => {
    const currentPage = resolveFinancePageForYear(current.year, year, current.page);
    return { year, page: typeof update === "function" ? update(currentPage) : update };
  });
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<FinanceImportReport | null>(null);
  const [importError, setImportError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setStatus("loading");
    fetch(`/api/finance?year=${year}&page=${page}&pageSize=20`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Finance unavailable");
        return response.json() as Promise<{ summary: FinanceSummary; transactions: TransactionPage }>;
      })
      .then((payload) => { setSummary(payload.summary); setTransactions(payload.transactions); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [page, year]);

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
      if (page === 1) load();
      else setPage(1);
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
        <div><p className="eyebrow">财务记录</p><h2>{year} 财务记录</h2>{summary && <p>统计截至 {summary.asOfDate}</p>}</div>
      </header>

      {report && <div className="financeImportReport" role="status">读取 {report.read} 条 · 新增 {report.inserted} · 更新 {report.updated} · 已存在 {report.skipped} · 失败 {report.failed}</div>}
      {importError && <div className="financeImportError" role="alert">{importError}</div>}

      {status === "loading" ? <div className="moduleState"><span className="statePulse" /><p>正在读取财务记录…</p></div> : status === "error" ? <div className="moduleState" role="alert"><p>财务记录读取失败。</p><button type="button" onClick={load}>重新加载</button></div> : summary && (
        <>
          <div className="lifeFinanceSummary">
            <div><span>今年收入</span><strong>¥{centsToYuan(summary.incomeCents)}</strong><small>今年收到的收入</small></div>
            <div><span>净消费</span><strong>¥{centsToYuan(summary.netExpenseCents)}</strong><small>支出减去退款</small></div>
            <div><span>家庭支出</span><strong>¥{centsToYuan(summary.familySupportCents)}</strong><small>与家庭相关的支出</small></div>
            <div><span>个人消费</span><strong>¥{centsToYuan(summary.personalExpenseCents)}</strong><small>除家庭支出外的个人净消费</small></div>
          </div>

          {summary.transactionCount === 0 ? <div className="lifeFinanceEmpty"><strong>今年还没有财务记录</strong><span>导入钱迹 JSON 或 Excel 后，这里会显示今年的收支。</span><FinanceImportTools importing={importing} inputRef={inputRef} onImport={(file) => void importFile(file)} /></div> : (
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
              <section className="financeTransactions" aria-labelledby="finance-transactions-title">
                <div className="financeSectionHead"><div><h3 id="finance-transactions-title">交易记录</h3><span>最近的生活收支记录</span></div>{transactions && <small>共 {transactions.total} 条</small>}</div>
                {transactions?.items.length ? <ol>{transactions.items.map((item) => <li key={item.key}>
                  <button type="button" onClick={() => setSelectedTransaction(item)} aria-label={`查看 ${item.title} 详情`}>
                    <time>{item.occurredAt.slice(0, 10)}</time>
                    <div><b>{item.title}</b><small>{FINANCE_TYPE_LABELS[item.type]} · {LIFE_DOMAIN_LABELS[item.effectiveLifeDomain]}</small></div>
                    <strong className={`financeAmount ${item.type}`}>{item.type === "expense" || item.type === "repayment" || item.type === "transfer" ? "−" : "+"}¥{centsToYuan(item.amountCents)}</strong>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>)}</ol> : <p className="financeTransactionsEmpty">暂无交易记录</p>}
                {transactions && transactions.totalPages > 1 && <nav className="financePagination" aria-label="交易记录分页">
                  <button type="button" disabled={page <= 1 || status === "loading"} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
                  <span>第 {transactions.page} / {transactions.totalPages} 页</span>
                  <button type="button" disabled={page >= transactions.totalPages || status === "loading"} onClick={() => setPage((value) => value + 1)}>下一页</button>
                </nav>}
              </section>
              <section className="financeDataTools" aria-label="数据管理"><div><span>数据管理</span><small>导入或更新钱迹记录</small></div><FinanceImportTools importing={importing} inputRef={inputRef} onImport={(file) => void importFile(file)} /></section>
            </div>
          )}
        </>
      )}
      {selectedTransaction && createPortal(<div className="financeDetailBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTransaction(null); }}>
        <section className="financeDetail" role="dialog" aria-modal="true" aria-labelledby="finance-detail-title">
          <header><div><p className="eyebrow">交易详情</p><h3 id="finance-detail-title">{selectedTransaction.title}</h3></div><button type="button" onClick={() => setSelectedTransaction(null)} aria-label="关闭交易详情">×</button></header>
          <div className="financeDetailAmount"><span>{FINANCE_TYPE_LABELS[selectedTransaction.type]}</span><strong>{selectedTransaction.type === "expense" || selectedTransaction.type === "repayment" || selectedTransaction.type === "transfer" ? "−" : "+"}¥{centsToYuan(selectedTransaction.amountCents)}</strong><small>{selectedTransaction.currency}</small></div>
          <dl>
            <div><dt>发生时间</dt><dd>{selectedTransaction.occurredAt.replace("T", " ").slice(0, 16)}</dd></div>
            <div><dt>原始类型</dt><dd>{selectedTransaction.rawType || FINANCE_TYPE_LABELS[selectedTransaction.type]}</dd></div>
            <div><dt>原始分类</dt><dd>{[selectedTransaction.rawCategory, selectedTransaction.rawSubcategory].filter(Boolean).join(" · ") || "未提供"}</dd></div>
            <div><dt>自动分类</dt><dd>{LIFE_DOMAIN_LABELS[selectedTransaction.lifeDomain]}</dd></div>
            <div><dt>当前分类</dt><dd>{LIFE_DOMAIN_LABELS[selectedTransaction.effectiveLifeDomain]}{selectedTransaction.lifeDomainOverride && <span>人工覆盖</span>}</dd></div>
          </dl>
          <div className="financeAuditFlow"><span>原始分类</span><i>→</i><span>自动分类</span>{selectedTransaction.lifeDomainOverride && <><i>→</i><span>人工覆盖</span></>}<i>→</i><strong>当前分类</strong></div>
          <div className="financeDetailSource"><h4>来源</h4><p>{SOURCE_LABELS[selectedTransaction.source] ?? selectedTransaction.source}</p><small>来源记录 ID</small><code>{selectedTransaction.sourceId}</code>{selectedTransaction.semanticNote && <><small>记录说明</small><p>{selectedTransaction.semanticNote}</p></>}</div>
          <p className="financeDetailExplanation">{selectedTransaction.type === "expense" ? `这笔支出按“${LIFE_DOMAIN_LABELS[selectedTransaction.effectiveLifeDomain]}”计入消费分布。` : selectedTransaction.type === "refund" ? `这笔退款从“${LIFE_DOMAIN_LABELS[selectedTransaction.effectiveLifeDomain]}”消费中扣除。` : selectedTransaction.type === "income" ? "这笔记录计入收入，不计入消费分布。" : "这笔资金移动不计入收入或消费。"}</p>
          <button className="financeDetailClose" type="button" onClick={() => setSelectedTransaction(null)}>返回交易记录</button>
        </section>
      </div>, document.body)}
    </article>
  );
}
