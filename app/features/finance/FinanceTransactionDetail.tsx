"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { centsToYuan, LIFE_DOMAIN_LABELS } from "./domain";
import { LIFE_DOMAINS, type FinanceTransactionAuditView, type FinanceTransactionType, type LifeDomain } from "./types";

const FINANCE_TYPE_LABELS: Record<FinanceTransactionType, string> = {
  expense: "支出",
  income: "收入",
  refund: "退款",
  transfer: "转账",
  repayment: "还款",
};

const SOURCE_LABELS: Record<string, string> = { qianji: "钱迹", "annual-preview-synthetic": "本地合成预览" };

type SaveState = "idle" | "saving" | "success" | "error";

function saveErrorMessage(status: number) {
  if (status === 400) return "请选择有效的生活分类。";
  if (status === 401) return "登录状态已失效，请重新登录。";
  if (status === 403) return "无法验证当前页面来源，请重新打开页面。";
  if (status === 404) return "这条交易已不存在，请刷新交易列表。";
  return "无法保存分类，请稍后重试。";
}

export function FinanceTransactionDetail({ transaction, onClose, onTransactionUpdated }: { transaction: FinanceTransactionAuditView; onClose: () => void; onTransactionUpdated: (transaction: FinanceTransactionAuditView) => void }) {
  const [draftOverride, setDraftOverride] = useState<LifeDomain | null>(transaction.lifeDomainOverride);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const saving = saveState === "saving";
  const dirty = draftOverride !== transaction.lifeDomainOverride;
  const selectedDomain = draftOverride ?? transaction.lifeDomain;

  const chooseDomain = (domain: LifeDomain) => {
    setDraftOverride(domain);
    setSaveState("idle");
    setSaveMessage("");
  };

  const restoreAutomatic = () => {
    setDraftOverride(null);
    setSaveState("idle");
    setSaveMessage("");
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaveState("saving");
    setSaveMessage("");
    try {
      const response = await fetch("/api/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transaction.id, lifeDomainOverride: draftOverride }),
      });
      if (!response.ok) {
        setSaveState("error");
        setSaveMessage(saveErrorMessage(response.status));
        return;
      }
      const payload = await response.json() as { transaction: FinanceTransactionAuditView; changed: boolean };
      setDraftOverride(payload.transaction.lifeDomainOverride);
      setSaveState("success");
      setSaveMessage(payload.changed ? "生活分类已保存。" : "生活分类没有变化。");
      onTransactionUpdated(payload.transaction);
    } catch {
      setSaveState("error");
      setSaveMessage("无法保存分类，请稍后重试。");
    }
  };

  return createPortal(<div className="financeDetailBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="financeDetail" role="dialog" aria-modal="true" aria-labelledby="finance-detail-title">
      <header><div><p className="eyebrow">交易详情</p><h3 id="finance-detail-title">{transaction.title}</h3></div><button type="button" onClick={onClose} aria-label="关闭交易详情">×</button></header>
      <div className="financeDetailAmount"><span>{FINANCE_TYPE_LABELS[transaction.type]}</span><strong>{transaction.type === "expense" || transaction.type === "repayment" || transaction.type === "transfer" ? "−" : "+"}¥{centsToYuan(transaction.amountCents)}</strong><small>{transaction.currency}</small></div>
      <dl>
        <div><dt>发生时间</dt><dd>{transaction.occurredAt.replace("T", " ").slice(0, 16)}</dd></div>
        <div><dt>原始类型</dt><dd>{transaction.rawType || FINANCE_TYPE_LABELS[transaction.type]}</dd></div>
        <div><dt>原始分类</dt><dd>{[transaction.rawCategory, transaction.rawSubcategory].filter(Boolean).join(" · ") || "未提供"}</dd></div>
        <div><dt>自动分类</dt><dd>{LIFE_DOMAIN_LABELS[transaction.lifeDomain]}</dd></div>
        <div><dt>当前分类</dt><dd>{LIFE_DOMAIN_LABELS[transaction.effectiveLifeDomain]}{transaction.lifeDomainOverride && <span>人工</span>}</dd></div>
      </dl>
      <div className="financeAuditFlow"><span>原始分类</span><i>→</i><span>自动分类</span>{transaction.lifeDomainOverride && <><i>→</i><span>人工覆盖</span></>}<i>→</i><strong>当前分类</strong></div>
      <form className={`financeDomainEditor ${saveState}`} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor="finance-life-domain">生活分类</label>
        <select id="finance-life-domain" value={selectedDomain} disabled={saving} aria-describedby="finance-domain-helper" aria-invalid={saveState === "error"} onChange={(event) => chooseDomain(event.target.value as LifeDomain)}>
          {LIFE_DOMAINS.map((domain) => <option key={domain} value={domain}>{LIFE_DOMAIN_LABELS[domain]}</option>)}
        </select>
        <div className="financeDomainActions">
          <button className="financeDomainSave" type="submit" disabled={!dirty || saving}>{saving ? "正在保存…" : "保存分类"}</button>
          {transaction.lifeDomainOverride !== null && draftOverride !== null && <button className="financeDomainRestore" type="button" disabled={saving} onClick={restoreAutomatic}>恢复自动分类</button>}
        </div>
        <p id="finance-domain-helper" className="financeDomainMessage" role={saveState === "error" ? "alert" : "status"}>{saveMessage || (draftOverride === null && transaction.lifeDomainOverride !== null ? `保存后恢复为自动分类“${LIFE_DOMAIN_LABELS[transaction.lifeDomain]}”。` : dirty ? `保存后按“${LIFE_DOMAIN_LABELS[selectedDomain]}”计入相关分类统计。` : "核查来源与自动分类后，可在这里修正当前分类。")}</p>
      </form>
      <div className="financeDetailSource"><h4>来源</h4><p>{SOURCE_LABELS[transaction.source] ?? transaction.source}</p><small>来源记录 ID</small><code>{transaction.sourceId}</code>{transaction.semanticNote && <><small>记录说明</small><p>{transaction.semanticNote}</p></>}</div>
      <p className="financeDetailExplanation">{transaction.type === "expense" ? `这笔支出按“${LIFE_DOMAIN_LABELS[transaction.effectiveLifeDomain]}”计入消费分布。` : transaction.type === "refund" ? `这笔退款从“${LIFE_DOMAIN_LABELS[transaction.effectiveLifeDomain]}”消费中扣除。` : transaction.type === "income" ? "这笔记录计入收入，不计入消费分布。" : "这笔资金移动不计入收入或消费。"}</p>
      <button className="financeDetailClose" type="button" onClick={onClose}>返回交易记录</button>
    </section>
  </div>, document.body);
}
