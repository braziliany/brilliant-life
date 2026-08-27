"use client";

import { createPortal } from "react-dom";
import { centsToYuan, LIFE_DOMAIN_LABELS } from "./domain";
import type { FinanceTransactionAuditView, FinanceTransactionType } from "./types";

const FINANCE_TYPE_LABELS: Record<FinanceTransactionType, string> = {
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
  repayment: "还款",
};

const SOURCE_LABELS: Record<string, string> = { qianji: "钱迹", "annual-preview-synthetic": "本地合成预览" };

export function FinanceTransactionDetail({ transaction, onClose }: { transaction: FinanceTransactionAuditView; onClose: () => void }) {
  return createPortal(<div className="financeDetailBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="financeDetail" role="dialog" aria-modal="true" aria-labelledby="finance-detail-title">
      <header><div><p className="eyebrow">交易详情</p><h3 id="finance-detail-title">{transaction.title}</h3></div><button type="button" onClick={onClose} aria-label="关闭交易详情">×</button></header>
      <div className="financeDetailAmount"><span>{FINANCE_TYPE_LABELS[transaction.type]}</span><strong>{transaction.type === "expense" || transaction.type === "repayment" || transaction.type === "transfer" ? "−" : "+"}¥{centsToYuan(transaction.amountCents)}</strong><small>{transaction.currency}</small></div>
      <dl>
        <div><dt>发生时间</dt><dd>{transaction.occurredAt.replace("T", " ").slice(0, 16)}</dd></div>
        <div><dt>原始类型</dt><dd>{transaction.rawType || FINANCE_TYPE_LABELS[transaction.type]}</dd></div>
        <div><dt>原始分类</dt><dd>{[transaction.rawCategory, transaction.rawSubcategory].filter(Boolean).join(" · ") || "未提供"}</dd></div>
        <div><dt>自动分类</dt><dd>{LIFE_DOMAIN_LABELS[transaction.lifeDomain]}</dd></div>
        <div><dt>当前分类</dt><dd>{LIFE_DOMAIN_LABELS[transaction.effectiveLifeDomain]}{transaction.lifeDomainOverride && <span>人工覆盖</span>}</dd></div>
      </dl>
      <div className="financeAuditFlow"><span>原始分类</span><i>→</i><span>自动分类</span>{transaction.lifeDomainOverride && <><i>→</i><span>人工覆盖</span></>}<i>→</i><strong>当前分类</strong></div>
      <div className="financeDetailSource"><h4>来源</h4><p>{SOURCE_LABELS[transaction.source] ?? transaction.source}</p><small>来源记录 ID</small><code>{transaction.sourceId}</code>{transaction.semanticNote && <><small>记录说明</small><p>{transaction.semanticNote}</p></>}</div>
      <p className="financeDetailExplanation">{transaction.type === "expense" ? `这笔支出按“${LIFE_DOMAIN_LABELS[transaction.effectiveLifeDomain]}”计入消费分布。` : transaction.type === "refund" ? `这笔退款从“${LIFE_DOMAIN_LABELS[transaction.effectiveLifeDomain]}”消费中扣除。` : transaction.type === "income" ? "这笔记录计入收入，不计入消费分布。" : "这笔资金移动不计入收入或消费。"}</p>
      <button className="financeDetailClose" type="button" onClick={onClose}>返回交易记录</button>
    </section>
  </div>, document.body);
}
