"use client";

import { useEffect, useRef, useState } from "react";
import { centsToYuan, LIFE_DOMAIN_LABELS, resolveFinancePageForYear } from "./domain";
import { FinanceTransactionDetail } from "./FinanceTransactionDetail";
import type { FinanceTransactionAuditView, FinanceTransactionType } from "./types";

type LoadStatus = "loading" | "ready" | "error";
type TransactionPage = { items: FinanceTransactionAuditView[]; page: number; pageSize: number; total: number; totalPages: number };

const FINANCE_TYPE_LABELS: Record<FinanceTransactionType, string> = {
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
  repayment: "还款",
};

const queryKey = (year: number, page: number) => `${year}:${page}`;

export function FinanceTransactionsPage({ initialYear }: { initialYear: number }) {
  const [pagination, setPagination] = useState(() => ({ year: initialYear, page: 1 }));
  const [transactions, setTransactions] = useState<TransactionPage | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransactionAuditView | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const listRef = useRef<HTMLElement>(null);
  const pendingScrollRef = useRef<string | null>(null);
  const { year, page } = pagination;
  const selectableYears = Array.from({ length: 6 }, (_, index) => initialYear - index);

  useEffect(() => {
    const controller = new AbortController();
    const requestedQuery = queryKey(year, page);
    setStatus("loading");
    fetch(`/api/finance?year=${year}&page=${page}&pageSize=20`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Finance unavailable");
        return response.json() as Promise<{ transactions: TransactionPage }>;
      })
      .then((payload) => {
        setTransactions(payload.transactions);
        setLoadedQuery(requestedQuery);
        setStatus("ready");
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("error"); });
    return () => controller.abort();
  }, [page, reloadKey, year]);

  useEffect(() => {
    if (status !== "ready" || pendingScrollRef.current !== loadedQuery) return;
    pendingScrollRef.current = null;
    const frame = window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "auto", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [loadedQuery, status]);

  const changePage = (nextPage: number) => {
    if (nextPage === page) return;
    pendingScrollRef.current = queryKey(year, nextPage);
    setPagination({ year, page: nextPage });
  };

  const changeYear = (nextYear: number) => {
    if (nextYear === year) return;
    const nextPage = resolveFinancePageForYear(year, nextYear, page);
    pendingScrollRef.current = queryKey(nextYear, nextPage);
    setPagination({ year: nextYear, page: nextPage });
  };

  return <main className="pageShell financeTransactionsShell">
    <section className="dashboard financeTransactionsDashboard">
      <header className="siteNavigation">
        <a className="siteBrand" href="/#life-finance" aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></a>
      </header>
      <div className="financeTransactionsPage">
        <a className="financeTransactionsBack" href="/#life-finance">← 财务记录</a>
        <header className="financeTransactionsPageHead">
          <div><p className="eyebrow">财务记录</p><h1>交易记录</h1><p>查看每一笔生活收支记录</p></div>
          <label>年份<select aria-label="交易年份" value={year} onChange={(event) => changeYear(Number(event.target.value))}>{selectableYears.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </header>

        <section ref={listRef} className="financeTransactions financeTransactionsStandalone" aria-labelledby="finance-transactions-title">
          <div className="financeSectionHead"><div><h2 id="finance-transactions-title">{year} 年交易</h2><span>{transactions ? `${transactions.total.toLocaleString("zh-CN")} 条生活收支记录` : "正在读取生活收支记录"}</span></div>{status === "loading" && transactions && <small>正在更新…</small>}</div>
          {status === "loading" && !transactions ? <div className="moduleState"><span className="statePulse" /><p>正在读取交易记录…</p></div> : status === "error" ? <div className="moduleState" role="alert"><p>交易记录读取失败。</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></div> : transactions?.items.length ? <ol>{transactions.items.map((item) => <li key={item.key}>
            <button type="button" onClick={() => setSelectedTransaction(item)} aria-label={`查看 ${item.title} 详情`}>
              <time>{item.occurredAt.slice(0, 10)}</time>
              <div><b>{item.title}</b><small>{FINANCE_TYPE_LABELS[item.type]} · {LIFE_DOMAIN_LABELS[item.effectiveLifeDomain]}</small></div>
              <strong className={`financeAmount ${item.type}`}>{item.type === "expense" || item.type === "repayment" || item.type === "transfer" ? "−" : "+"}¥{centsToYuan(item.amountCents)}</strong>
              <span aria-hidden="true">›</span>
            </button>
          </li>)}</ol> : <p className="financeTransactionsEmpty">暂无交易记录</p>}
          {transactions && transactions.totalPages > 1 && <nav className="financePagination" aria-label="交易记录分页">
            <button type="button" disabled={page <= 1 || status === "loading"} onClick={() => changePage(Math.max(1, page - 1))}>上一页</button>
            <span>第 {transactions.page} / {transactions.totalPages} 页</span>
            <button type="button" disabled={page >= transactions.totalPages || status === "loading"} onClick={() => changePage(page + 1)}>下一页</button>
          </nav>}
        </section>
      </div>
      {selectedTransaction && <FinanceTransactionDetail transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} />}
    </section>
  </main>;
}
