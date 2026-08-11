import type { HealthLoadStatus, WorkExperience } from "../../page-view.types";

type Props = {
  active: boolean;
  hasTodayHealth: boolean;
  healthLoadStatus: HealthLoadStatus;
  steps: number;
  monthLabel: string;
  elapsedWorkdays: number;
  remainingWorkdays: number;
  calendarReady: boolean;
  savedSalaryMonths: number;
  totalNetSalary: number;
  salaryReady: boolean;
  currentCareer: WorkExperience | null;
  money: (value: number) => string;
  onOpen: (section: string) => void;
};

export function DataCenterOverview({ active, hasTodayHealth, healthLoadStatus, steps, monthLabel, elapsedWorkdays, remainingWorkdays, calendarReady, savedSalaryMonths, totalNetSalary, salaryReady, currentCareer, money, onOpen }: Props) {
  return (
    <section id="data-overview" className={`dataCenterOverview${active ? " sectionActive" : ""}`} aria-labelledby="data-overview-title">
      <div className="dataOverviewHead">
        <div><p className="eyebrow">最近记录</p><h2 id="data-overview-title">数据总览</h2></div>
        <p>今天 · 本月 · 今年</p>
      </div>
      <div className="dataOverviewFacts">
        <button type="button" onClick={() => onOpen("health")}><span>HEALTH · 今日</span><strong>{healthLoadStatus === "loading" ? "读取中" : healthLoadStatus === "error" || !hasTodayHealth ? "—" : steps.toLocaleString("zh-CN")}</strong><small>{healthLoadStatus === "ready" && hasTodayHealth ? "步" : "等待今日健康记录"}</small></button>
        <button type="button" onClick={() => onOpen("time")}><span>TIME · {monthLabel}</span><strong>{calendarReady ? elapsedWorkdays : "—"}</strong><small>{calendarReady ? `已过工作日 · 剩余 ${remainingWorkdays} 天` : "工作日历暂不可用"}</small></button>
        <button type="button" onClick={() => onOpen("finance")}><span>FINANCE · 今年已保存</span><strong>{salaryReady && savedSalaryMonths ? `¥${money(totalNetSalary)}` : "—"}</strong><small>{salaryReady ? `${savedSalaryMonths} 个月工资快照` : "工资记录暂不可用"}</small></button>
        <button type="button" onClick={() => onOpen("career")}><span>CAREER · 当前 / 最近</span><strong>{currentCareer?.role ?? "—"}</strong><small>{currentCareer ? currentCareer.company : "尚无职业经历"}</small></button>
      </div>
    </section>
  );
}
