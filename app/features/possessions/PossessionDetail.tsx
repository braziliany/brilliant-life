import { ITEM_STATUSES, formatCost, type ItemDetail, type UseRecord } from "./domain";
import styles from "./PossessionsPage.module.css";

// Presentation only: consume the existing server metrics and unchanged action callbacks.
export function PossessionDetail({ detail, busy, onEdit, onUse, onArchive, onEditUse, onRemoveUse }: {
  detail: ItemDetail; busy: boolean; onEdit: () => void; onUse: () => void; onArchive: () => void;
  onEditUse: (use: UseRecord) => void; onRemoveUse: (use: UseRecord) => void;
}) {
  const { item, uses, asOf } = detail;
  return <article className={styles.detail} aria-label="物品详情">
    <section className={styles.detailHero} aria-label="物品主信息">
      <div className={styles.identity}>
        <p className={styles.itemCategory}>{item.category}<span aria-hidden="true">·</span>{ITEM_STATUSES[item.status]}{item.archivedAt && <span className={styles.archivedBadge}>已归档</span>}</p>
        <h2>{item.name}</h2>
        <p className={styles.brand}>{item.brandModel || "未填写品牌／型号"}</p>
        {item.notes && <p className={styles.description}>{item.notes.length > 120 ? `${item.notes.slice(0, 120)}…` : item.notes}</p>}
        {item.notes.length > 120 && <details className={styles.fullNote}><summary>完整备注</summary><p className={styles.notes}>{item.notes}</p></details>}
      </div>
      <dl className={styles.heroStats} aria-label="物品关键数据">
        <div><dt>实际购买价格</dt><dd>{item.purchasePriceCents === null ? "未知" : formatCost(item.purchasePriceCents)}</dd></div>
        <div><dt>累计记录使用</dt><dd>{item.metrics.recordedUses} 次</dd></div>
        <div><dt>持有天数</dt><dd>{item.metrics.holdingDays === null ? "不可计算" : `${item.metrics.holdingDays} 天`}</dd></div>
        <div className={styles.emphasis}><dt>每次使用成本</dt><dd>{formatCost(item.metrics.perUseCents)}</dd><small>按已记录次数</small></div>
      </dl>
    </section>
    <div className={styles.detailActionBar}>
      <div><p className={styles.asOf}>统计截至 {asOf}</p><p className={styles.archiveHint}>归档仅收起物品，保留历史与持有状态。</p></div>
      <div className={styles.actions} role="group" aria-label="物品操作">
        <button type="button" disabled={busy} onClick={onEdit}>编辑物品</button>
        <button className={styles.primary} type="button" disabled={busy} onClick={onUse}>记录使用</button>
        <button className={styles.archiveAction} type="button" disabled={busy} onClick={onArchive}>{item.archivedAt ? "取消归档" : "归档物品"}</button>
      </div>
    </div>
    <div className={styles.detailColumns}>
      <section className={styles.infoSection} aria-label="物品信息"><h3>物品信息</h3>
        <dl className={styles.infoRows}>
          <div><dt>购买日期</dt><dd>{item.purchaseDate || "未填写"}</dd></div>
          <div><dt>停止持有日期</dt><dd>{item.endedDate || "—"}</dd></div>
          <div><dt>当前状态</dt><dd>{ITEM_STATUSES[item.status]}</dd></div>
          {item.sourceWishId !== null && <div><dt>来源</dt><dd>愿望 #{item.sourceWishId}</dd></div>}
        </dl>
      </section>
      <section className={styles.costSection} aria-label="使用成本"><h3>使用成本</h3>
        <dl className={styles.dailyCost}><div><dt>每天持有成本</dt><dd>{formatCost(item.metrics.perDayCents)}</dd></div></dl>
        <p className={styles.costHint}>已知购买价格 ÷ 有效持有天数</p>
        <details className={styles.calculation}><summary>计算口径</summary><p>每次成本按已记录次数计算，不代表全部真实使用。持有天数含购买日和截止日；已退出的物品截止到真实结束日期。价格或分母未知时不计算。</p></details>
      </section>
    </div>
    <section className={styles.useSection} aria-label="使用记录列表"><div className={styles.useSectionHead}><h3>使用记录</h3><span>仅记录真实发生的使用</span></div>
      {uses.length === 0 ? <p className={styles.muted}>还没有记录过使用。可以补记真实发生的日期。</p> : <ul className={styles.list}>{uses.map(use => <li className={styles.useRow} key={use.id}>
        <time>{use.usedOn}</time><b>{use.count} 次</b><p className={`${styles.notes} ${styles.useNote}`}>{use.note}</p>
        <div className={styles.actions}><button type="button" disabled={busy} aria-label={`编辑使用记录 ${use.usedOn}`} onClick={() => onEditUse(use)}>编辑</button><button type="button" disabled={busy} aria-label={`删除使用记录 ${use.usedOn}`} onClick={() => onRemoveUse(use)}>删除</button></div>
      </li>)}</ul>}
    </section>
  </article>;
}
