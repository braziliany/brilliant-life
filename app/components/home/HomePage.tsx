import type { HealthLoadStatus, ShanghaiDate } from "../../page-view.types";

type Props = {
  today: ShanghaiDate;
  dailyQuote: { text: string; source: string };
  healthLoadStatus: HealthLoadStatus;
  steps: number;
  stepGoal: number;
  stepProgress: number;
  activeEnergy: number;
  workdays: number;
  healthHistoryDays: number;
  netSalary: number;
  workExperienceCount: number;
  money: (value: number) => string;
  onOpenDashboard: (section?: string) => void;
  onOpenAnnual: () => void;
};

export function HomePage({ today, dailyQuote, healthLoadStatus, steps, stepGoal, stepProgress, activeEnergy, workdays, healthHistoryDays, netSalary, workExperienceCount, money, onOpenDashboard, onOpenAnnual }: Props) {
  return (
    <section className="homePage">
      <div className="homeHero">
        <div>
          <p className="eyebrow">{today.weekday} · {today.month + 1}月{today.day}日</p>
          <h1 className="dailyQuote">“{dailyQuote.text}”</h1>
          <p className="quoteSource">— {dailyQuote.source} · 《原神》每日一言</p>
          <p>把健康、工作、收入与职业经历放在同一个地方，清楚看见生活正在如何向前。</p>
          <div className="homeHeroActions">
            <button type="button" onClick={() => onOpenDashboard()}>进入数据中心 <span>→</span></button>
            <button type="button" onClick={onOpenAnnual}>查看今年 <span>→</span></button>
          </div>
        </div>
        <div className="homeSnapshot" aria-label="今日生活概览">
          <div className="snapshotHead"><div><i /><span>今日状态</span></div><small>{today.month + 1}月{today.day}日</small></div>
          <div className="snapshotPrimary"><span>今日步数</span><strong>{healthLoadStatus === "loading" ? "读取中" : healthLoadStatus === "error" ? "—" : steps.toLocaleString("zh-CN")}</strong><small>{healthLoadStatus === "error" ? "健康数据暂时无法读取" : `目标 ${stepGoal.toLocaleString("zh-CN")} 步`}</small><div><i style={{ width: `${stepProgress}%` }} /></div></div>
          <div className="snapshotMetrics">
            <div><span>活动能量</span><b>{activeEnergy.toLocaleString("zh-CN")}</b><small>千卡</small></div>
            <div><span>本月工作</span><b>{workdays}</b><small>天</small></div>
          </div>
          <button type="button" onClick={() => onOpenDashboard("health")}><span>查看完整数据</span><b>↗</b></button>
        </div>
      </div>
      <div className="homeHighlights">
        <button type="button" onClick={() => onOpenDashboard("health")}><i className="healthHighlight" /><span>健康趋势</span><strong>{healthHistoryDays} 天</strong><small>Apple 健康记录</small></button>
        <button type="button" onClick={() => onOpenDashboard("time")}><i className="calendarHighlight" /><span>本月工作</span><strong>{workdays} 天</strong><small>日历实时统计</small></button>
        <button type="button" onClick={() => onOpenDashboard("finance")}><i className="salaryHighlight" /><span>预计实发</span><strong>¥{money(netSalary)}</strong><small>按当前工作日计算</small></button>
        <button type="button" onClick={() => onOpenDashboard("career")}><i className="careerHighlight" /><span>职业经历</span><strong>{workExperienceCount} 条</strong><small>已保存工作经历</small></button>
      </div>
    </section>
  );
}
