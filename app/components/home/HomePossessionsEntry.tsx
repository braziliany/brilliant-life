import styles from "./HomePossessionsEntry.module.css";

export function HomePossessionsEntry() {
  return <a className={styles.entry} href="/possessions" aria-label="进入物品档案">
    <div className={styles.title}><span className={styles.kicker}>POSSESSIONS</span><h2>物品</h2></div>
    <div className={styles.description}><p>拥有的、用过的，慢慢记成档案。</p><span>购买信息 · 使用记录 · 愿望清单</span></div>
    <span className={styles.open}>打开档案 <span aria-hidden="true">→</span></span>
  </a>;
}
