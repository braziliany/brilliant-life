import type { ShanghaiDate } from "../../page-view.types";

export function DashboardHeader({ today }: { today: ShanghaiDate }) {
  return (
    <header className="topbar">
      <div><p className="eyebrow">{today.weekday} · {today.month + 1}月{today.day}日</p><h1>早上好，Amanda!</h1><p className="subtitle">来看看你今天的活动进度吧</p></div>
      <div className="actions"><label className="search"><span>⌕</span><input aria-label="搜索健康数据" placeholder="搜索健康数据" /></label><button>升级计划</button></div>
    </header>
  );
}
