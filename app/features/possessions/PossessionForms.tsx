"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { ITEM_STATUSES, WISH_STATUSES, stoppedHolding, yuanToCents, type ItemInput, type WishInput, type UseInput } from "./domain";
import styles from "./PossessionsPage.module.css";
import { itemPayload, wishPayload, usePayload } from "./payload";

const yuan = (cents: number | null) => cents === null ? "" : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
export const blankItem = (name = "", notes = ""): ItemInput => ({ name, category: "其他", brandModel: null, purchaseDate: null, purchasePriceCents: null, notes, status: "in_use", endedDate: null });
const message = (error: unknown) => error instanceof Error ? error.message : "保存失败，草稿已保留，请重试。";

function Form({ name, busy, onSubmit, onCancel, children, hint }: { name: string; busy: boolean; onSubmit: (event: FormEvent) => void; onCancel: () => void; children: ReactNode; hint?: string }) {
  return <form className={styles.form} aria-label={name} aria-busy={busy} onSubmit={onSubmit}>
    <h2>{name}</h2>{hint && <p className={styles.muted}>{hint}</p>}
    <fieldset disabled={busy}>{children}</fieldset>
    <div className={styles.actions}><button type="button" disabled={busy} onClick={onCancel}>取消</button><button className={styles.primary} type="submit" disabled={busy}>{busy ? "保存中…" : "保存"}</button></div>
  </form>;
}

export function ItemForm({ initial, title, converting = false, today, busy, onSave, onCancel }: {
  initial: ItemInput; title: string; converting?: boolean; today: string; busy: boolean; onSave: (value: ItemInput) => Promise<void>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => itemPayload(initial));
  const [price, setPrice] = useState(yuan(initial.purchasePriceCents));
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try { await onSave(itemPayload({ ...draft, purchasePriceCents: yuanToCents(price) })); } catch (error) { setError(message(error)); }
  };
  return <Form name={title} busy={busy} onSubmit={submit} onCancel={onCancel} hint={converting ? "保留愿望来源。预算不是成交价，请填写真实购买信息；未知可留空。" : "购买日期和成交价可以留空，之后再补充。"}>
    <label>名称<input required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <label>分类<input required maxLength={60} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} /></label>
    <label>品牌／型号<input maxLength={120} value={draft.brandModel ?? ""} onChange={e => setDraft({ ...draft, brandModel: e.target.value || null })} /></label>
    <label>购买日期（可选）<input type="date" max={today} value={draft.purchaseDate ?? ""} onChange={e => setDraft({ ...draft, purchaseDate: e.target.value || null })} /></label>
    <label>实际购买价格（元，可选）<input type="number" inputMode="decimal" min="0" step="0.01" placeholder="未知，留空" value={price} onChange={e => setPrice(e.target.value)} /></label>
    <label>当前状态<select value={draft.status} onChange={e => { const status = e.target.value as ItemInput["status"]; setDraft({ ...draft, status, endedDate: stoppedHolding(status) ? draft.endedDate : null }); }}>{Object.entries(ITEM_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {stoppedHolding(draft.status) && <label>停止持有日期<input required type="date" min={draft.purchaseDate ?? undefined} max={today} value={draft.endedDate ?? ""} onChange={e => setDraft({ ...draft, endedDate: e.target.value || null })} /></label>}
    <label className={styles.wide}>备注<textarea maxLength={2000} rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
    {error && <p className={styles.error} role="alert">{error} 草稿已保留。</p>}
  </Form>;
}

export function WishForm({ initial, busy, onSave, onCancel }: { initial?: WishInput; busy: boolean; onSave: (value: WishInput) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<WishInput>(() => wishPayload(initial ?? { name: "", budgetCents: null, plannedDate: null, notes: "", status: "wanted" }));
  const [budget, setBudget] = useState(yuan(draft.budgetCents));
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await onSave(wishPayload({ ...draft, budgetCents: yuanToCents(budget) })); } catch (error) { setError(message(error)); } };
  return <Form name={initial ? "编辑愿望" : "新增愿望"} busy={busy} onSubmit={submit} onCancel={onCancel}>
    <label>愿望名称<input required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <label>预期价格或预算（元，可选）<input type="number" inputMode="decimal" min="0" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} /></label>
    <label>计划购买日期（可选）<input type="date" value={draft.plannedDate ?? ""} onChange={e => setDraft({ ...draft, plannedDate: e.target.value || null })} /></label>
    <label>愿望状态<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as WishInput["status"] })}>{Object.entries(WISH_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label className={styles.wide}>愿望备注<textarea maxLength={2000} rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
    {error && <p className={styles.error} role="alert">{error} 草稿已保留。</p>}
  </Form>;
}

export function UseForm({ initial, today, busy, onSave, onCancel }: { initial: UseInput; today: string; busy: boolean; onSave: (value: UseInput) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(() => usePayload(initial));
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await onSave(usePayload(draft)); } catch (error) { setError(message(error)); } };
  return <Form name="使用记录" busy={busy} onSubmit={submit} onCancel={onCancel} hint="只记录真实使用；同一天可以分别补记，不自动推断空白日期。">
    <label>使用日期<input required type="date" max={today} value={draft.usedOn} onChange={e => setDraft({ ...draft, usedOn: e.target.value })} /></label>
    <label>使用次数<input required type="number" inputMode="numeric" min="1" max="1000000" step="1" value={draft.count} onChange={e => setDraft({ ...draft, count: Number(e.target.value) })} /></label>
    <label className={styles.wide}>使用备注<textarea maxLength={500} rows={2} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
    {error && <p className={styles.error} role="alert">{error} 草稿已保留。</p>}
  </Form>;
}
