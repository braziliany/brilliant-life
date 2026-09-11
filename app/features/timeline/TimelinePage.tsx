"use client";

import { useEffect, useState } from "react";
import { SiteNavigation } from "../../components/shell/SiteNavigation";
import { groupTimelineItemsByYear } from "./domain";
import type { TimelineItem } from "./types";
import styles from "./TimelinePage.module.css";

const kindLabels = {
  career: "工作经历",
  salary: "工资",
  annual: "年度记录",
} as const;

export function TimelinePage() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/timeline", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Timeline unavailable");
        return response.json() as Promise<{ items: TimelineItem[] }>;
      })
      .then(({ items: nextItems }) => {
        setItems(nextItems);
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const groups = groupTimelineItemsByYear(items);

  return (
    <main className="pageShell timelineShell">
      <section className="dashboard timelineDashboard">
        <SiteNavigation activePage="timeline" />
        <div className={styles.page}>
          <header className={styles.intro}>
            <h1>我的时间线</h1>
            <p>按时间查看已经保存的职业经历、工资与年度记录。</p>
          </header>

          {status === "loading" && <div className={styles.state} aria-live="polite">正在整理时间线…</div>}
          {status === "error" && <div className={styles.state} role="alert"><div><p>时间线暂时无法读取。</p><button className={styles.retry} type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></div></div>}
          {status === "ready" && groups.length === 0 && <div className={styles.state}>还没有可以放进时间线的记录。</div>}
          {status === "ready" && groups.length > 0 && <div className={styles.years}>
            {groups.map((group) => <section className={styles.year} key={group.year} aria-labelledby={`timeline-year-${group.year}`}>
              <h2 id={`timeline-year-${group.year}`}>{group.year}</h2>
              <ol className={styles.list}>
                {group.items.map((item) => <li className={styles.item} key={item.id}>
                  <a className={styles.link} href={item.href}>
                    <time className={styles.date}>{item.datePrecision === "month" ? `${String(item.month).padStart(2, "0")}月` : "全年"}</time>
                    <span className={styles.fact}>
                      <span className={styles.kind}>{kindLabels[item.kind]}</span>
                      <strong>{item.title}</strong>
                      {item.summary && <small>{item.summary}</small>}
                    </span>
                    <span className={styles.arrow} aria-hidden="true">→</span>
                  </a>
                </li>)}
              </ol>
            </section>)}
          </div>}
        </div>
      </section>
    </main>
  );
}
