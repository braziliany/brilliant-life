"use client";
import { useEffect, useRef, useState } from "react";
import { SiteNavigation } from "../../components/shell/SiteNavigation";
import { ItemForm, WishForm, UseForm, blankItem } from "./PossessionForms";
import { ITEM_STATUSES, WISH_STATUSES, formatCost, stoppedHolding, shanghaiToday, type Item, type ItemDetail, type Overview, type UseRecord, type Wish } from "./domain";
import styles from "./PossessionsPage.module.css";
import { PossessionDetail } from "./PossessionDetail";

async function readJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  let data;
  try { data = await response.json(); } catch { throw new Error("返回内容无效，请检查登录状态后重试。"); }
  if (!response.ok) throw new Error(data.error || "请求失败，请重试。");
  return data;
}
type Editor = { kind: "item"; item?: Item } | { kind: "wish"; wish?: Wish } | { kind: "convert"; wish: Wish } | { kind: "use"; use?: UseRecord };

export function PossessionsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"items" | "wishes" | "archive">("items");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    readJson("/api/possessions", { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (selectedId === null) { setDetail(null); return; }
    const controller = new AbortController(); setDetailLoading(true); setDetailError("");
    readJson(`/api/possessions?itemId=${selectedId}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setDetail(value); })
      .catch(e => { if (!controller.signal.aborted) setDetailError(e.message); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, revision]);
  const today = data?.asOf ?? shanghaiToday();
  const current = detail?.item.id === selectedId ? detail : null;
  const mutate = async (resource: string, method: string, payload: unknown) => {
    if (lock.current) throw new Error("正在保存，请稍候。");
    lock.current = true; setBusy(true); setNotice("");
    try {
      const saved = await readJson(`/api/possessions/${resource}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setEditor(null); setNotice("已保存。正在重新读取最新记录。"); setRevision(v => v + 1);
      return saved;
    } finally { lock.current = false; setBusy(false); }
  };
  const openItem = (id: number) => { if (!busy) { setEditor(null); setSelectedId(id); setNotice(""); } };
  const selectTab = (next: typeof tab) => { if (!busy) { setEditor(null); setSelectedId(null); setTab(next); setNotice(""); } };
  const listed = data?.items.filter(item => tab === "archive" ? item.archivedAt !== null : item.archivedAt === null) ?? [];
  const live = data?.items ?? [];
  const incidental = (action: () => Promise<unknown>) => { setError(""); void action().catch(e => setError(e.message)); };

  return <main className="pageShell"><div className="dashboard">
    <SiteNavigation activePage="possessions" />
    <section className={`${styles.page}${selectedId !== null ? ` ${styles.detailPage}` : ""}`} aria-labelledby="possessions-title">
      <header className={styles.header}><div><p className={styles.eyebrow}>POSSESSIONS · 长期档案</p><h1 id="possessions-title">物品</h1><p className={styles.muted}>拥有的、用过的，以及后来发生的事。</p></div><a href="/">返回首页 →</a></header>
      {data && selectedId === null && <div className={styles.overview} aria-label="物品总览"><div><b>{live.filter(item => !stoppedHolding(item.status)).length}</b><span>正在持有</span></div><div><b>{live.filter(item => stoppedHolding(item.status)).length}</b><span>已停止持有</span></div><div><b>{data.wishes.filter(wish => wish.status === "wanted").length}</b><span>想买</span></div></div>}
      <div className={styles.tabs} aria-label="物品视图">{([["items", "物品档案"], ["wishes", "愿望清单"], ["archive", "已归档"]] as const).map(([key, label]) => <button type="button" key={key} disabled={busy} aria-pressed={tab === key} onClick={() => selectTab(key)}>{label}</button>)}</div>
      {notice && <p className={styles.muted} role="status">{loading || detailLoading ? notice : "已保存。"}</p>}
      {error && <div className={styles.error} role="alert"><p>{error} {data ? "当前保留上次读取的内容，可能未更新。" : "暂无可用数据。"}</p><button type="button" disabled={busy} onClick={() => setRevision(v => v + 1)}>重新读取</button></div>}
      {loading && <p className={styles.muted} role="status">正在读取物品档案…</p>}
      {editor?.kind === "item" && <ItemForm key={`item-${editor.item?.id ?? "new"}`} initial={editor.item ?? blankItem()} title={editor.item ? "编辑物品" : "新增物品"} today={today} busy={busy} onCancel={() => setEditor(null)} onSave={async value => { await mutate("items", editor.item ? "PUT" : "POST", { ...value, ...(editor.item ? { id: editor.item.id } : {}) }); }} />}
      {editor?.kind === "convert" && <ItemForm key={`convert-${editor.wish.id}`} initial={blankItem(editor.wish.name, editor.wish.notes)} title="转入物品档案" converting today={today} busy={busy} onCancel={() => setEditor(null)} onSave={async value => { const saved = await mutate("convert", "POST", { wishId: editor.wish.id, item: value }); setTab("items"); setSelectedId(saved.item.id); }} />}
      {editor?.kind === "wish" && <WishForm key={`wish-${editor.wish?.id ?? "new"}`} initial={editor.wish} busy={busy} onCancel={() => setEditor(null)} onSave={async value => { await mutate("wishes", editor.wish ? "PUT" : "POST", { ...value, ...(editor.wish ? { id: editor.wish.id } : {}) }); }} />}
      {editor?.kind === "use" && selectedId !== null && <UseForm key={`use-${editor.use?.id ?? "new"}-${selectedId}`} initial={editor.use ?? { itemId: selectedId, usedOn: today, count: 1, note: "" }} today={today} busy={busy} onCancel={() => setEditor(null)} onSave={async value => { await mutate("uses", editor.use ? "PUT" : "POST", { ...value, ...(editor.use ? { id: editor.use.id } : {}) }); }} />}
      {!editor && selectedId !== null ? <>
        <button className={styles.back} type="button" disabled={busy} onClick={() => setSelectedId(null)}>← 返回列表</button>
        {detailLoading && <p role="status" className={styles.muted}>正在读取物品详情…</p>}
        {detailError && <div role="alert" className={styles.error}>{detailError} 详情未更新。<button type="button" onClick={() => setRevision(v => v + 1)}>重试详情</button></div>}
        {current && !detailLoading && !detailError && <PossessionDetail detail={current} busy={busy}
          onEdit={() => setEditor({ kind: "item", item: current.item })}
          onUse={() => setEditor({ kind: "use" })}
          onArchive={() => incidental(() => mutate("items", "PATCH", { id: current.item.id, archived: !current.item.archivedAt }))}
          onEditUse={use => setEditor({ kind: "use", use })}
          onRemoveUse={use => { if (window.confirm("删除这条误录的使用记录？累计次数会重新计算。")) incidental(() => mutate("uses", "DELETE", { id: use.id, itemId: use.itemId })); }} />}
      </> : !editor && data && (tab === "wishes" ? <>
        <div className={styles.heading}><h2>愿望清单</h2><button className={styles.primary} type="button" disabled={busy} onClick={() => setEditor({ kind: "wish" })}>新增愿望</button></div>
        <p className={styles.muted}>预算只是计划。已购买后，可自行填写成交信息转入档案。</p>
        {data.wishes.length === 0 && <p className={styles.empty}>还没有愿望。记录想买的东西，慢慢决定。</p>}
        <ul className={styles.list}>{data.wishes.map(wish => { const linked = data.items.find(item => item.sourceWishId === wish.id); return <li className={styles.wish} key={wish.id}><div><span className={styles.eyebrow}>{WISH_STATUSES[wish.status]}</span><h3>{wish.name}</h3><p className={styles.muted}>预算 {wish.budgetCents === null ? "未填写" : formatCost(wish.budgetCents)} · 计划 {wish.plannedDate || "未填写"}</p>{wish.notes && <p className={styles.notes}>{wish.notes}</p>}</div><div className={styles.actions}><button type="button" disabled={busy} aria-label={`编辑愿望 ${wish.name}`} onClick={() => setEditor({ kind: "wish", wish })}>编辑</button>{linked ? <button type="button" disabled={busy} onClick={() => { setTab("items"); openItem(linked.id); }}>查看物品</button> : wish.status === "purchased" && <button type="button" disabled={busy} onClick={() => setEditor({ kind: "convert", wish })}>转入档案</button>}</div></li>; })}</ul>
      </> : <>
        <div className={styles.heading}><h2>{tab === "archive" ? "已归档" : "物品档案"}</h2>{tab !== "archive" && <button type="button" className={styles.primary} disabled={busy} onClick={() => setEditor({ kind: "item" })}>新增物品</button>}</div>
        {listed.length === 0 && <p className={styles.empty}>{tab === "archive" ? "暂无归档物品。" : "从一件常用的物品开始。价格和购买日期可以之后补充。"}</p>}
        <ul className={styles.items}>{listed.map(item => <li key={item.id}><button className={styles.item} type="button" disabled={busy} onClick={() => openItem(item.id)}><span className={styles.eyebrow}>{item.category} · {ITEM_STATUSES[item.status]}</span><strong>{item.name}</strong><span className={styles.muted}>{item.brandModel || "未填写品牌／型号"}</span><span className={styles.itemFoot}><span>已记录 {item.metrics.recordedUses} 次使用</span><span aria-hidden="true">→</span></span></button></li>)}</ul>
      </>)}
    </section>
  </div></main>;
}
