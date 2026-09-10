import type { SalaryRecord } from "../../page-view.types";
import { buildSalaryTrendPoints } from "./trend";

type Props = {
  active: boolean;
  monthLabel: string;
  calendarMonthKey: string;
  workdays: number;
  dailyRate: number;
  deductions: number;
  taxThreshold: number;
  taxRate: number;
  leaveDeduction: number;
  grossSalary: number;
  taxableIncome: number;
  incomeTax: number;
  netSalary: number;
  salaryRecordMismatch: boolean;
  selectedSalaryRecord?: SalaryRecord;
  salaryStatus: "idle" | "saving" | "saved" | "error";
  salaryRecords: SalaryRecord[];
  yearSavedMonths: number;
  yearTotalNetSalary: number;
  yearTotalIncomeTax: number;
  salaryLoadStatus: "loading" | "ready" | "error";
  isCurrentCalendarMonth: boolean;
  holidayCalendarConfigured: boolean;
  money: (value: number) => string;
  onSave: () => void;
  onExport: () => void;
  onReload: () => void;
};

export function SalaryDashboard({ active, monthLabel, calendarMonthKey, workdays, dailyRate, deductions, taxThreshold, taxRate, leaveDeduction, grossSalary, taxableIncome, incomeTax, netSalary, salaryRecordMismatch, selectedSalaryRecord, salaryStatus, salaryRecords, yearSavedMonths, yearTotalNetSalary, yearTotalIncomeTax, salaryLoadStatus, isCurrentCalendarMonth, holidayCalendarConfigured, money, onSave, onExport, onReload }: Props) {
  const salaryTrendPoints = buildSalaryTrendPoints(salaryRecords);
  const trendLine = salaryTrendPoints.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <article id="finance" className={`card salary${active ? " sectionActive" : ""}`}>
      <div className="salaryIntro">
        <div>
          <p className="eyebrow">FINANCE · 工资记录</p>
          <h2>{monthLabel}工资</h2>
          <p className="salarySubtitle">日薪 {money(dailyRate)} 元，固定扣除 {money(deductions)} 元，起征点 {money(taxThreshold)} 元，税率 {taxRate}%</p>
        </div>
        <label className="workdayInput"><span>{monthLabel}工作日</span><input type="number" readOnly value={workdays} /><b>天</b></label>
      </div>
      <div className="salaryYearFacts"><div><span>已保存月份</span><strong>{yearSavedMonths}</strong><small>个月</small></div><div><span>累计工资</span><strong>{yearSavedMonths ? `¥ ${money(yearTotalNetSalary)}` : "—"}</strong><small>来自已保存记录</small></div><div><span>累计个税</span><strong>{yearSavedMonths ? `¥ ${money(yearTotalIncomeTax)}` : "—"}</strong><small>来自已保存记录</small></div></div>
      <div className="salarySummary">
        <div className="netPay"><span>{holidayCalendarConfigured ? "本月预计工资" : "非官方日历估算"}</span><strong>¥ {money(netSalary)}</strong><small>按当前工作日历计算 · {workdays} 个工作日</small></div>
        <div className="salaryMetrics">
          <div><span>应发工资</span><b>¥ {money(grossSalary)}</b><small>工作日 × 日薪</small></div>
          <div><span>全部扣除</span><b>− ¥ {money(deductions + leaveDeduction)}</b><small>固定扣除</small></div>
          <div><span>计税收入</span><b>¥ {money(taxableIncome)}</b><small>扣除后再减 ¥{money(taxThreshold)}</small></div>
          <div><span>个人所得税</span><b>− ¥ {money(incomeTax)}</b><small>计税收入 × {taxRate}%</small></div>
        </div>
      </div>
      <div className="salaryFormula"><span>计算公式</span><code>工资 = 工作日 × 日薪 + 额外收入 + 奖金 − 固定扣除 − 请假扣款 − 个税</code></div>
      {salaryRecordMismatch && selectedSalaryRecord && (
        <div className="salaryMismatch" role="status">
          <div><b>{monthLabel}的日历与已保存工资不一致</b><span>当前日历 {workdays} 天，预计工资 ¥{money(netSalary)}；历史记录 {selectedSalaryRecord.workdays} 天，工资 ¥{money(selectedSalaryRecord.netSalary)}。</span></div>
          <button type="button" onClick={onSave} disabled={salaryStatus === "saving"}>{salaryStatus === "saving" ? "同步中…" : `同步为 ${workdays} 天`}</button>
        </div>
      )}
      <div className="salaryHistoryHead">
        <div><p className="eyebrow">按月记录</p><h3>工资历史</h3></div>
        <div className="salaryHistoryActions">
          <button type="button" className="exportSalary" onClick={onExport} disabled={salaryRecords.length === 0}>导出 CSV</button>
          <button type="button" className="saveSalary" onClick={onSave} disabled={salaryStatus === "saving" || !isCurrentCalendarMonth || !holidayCalendarConfigured}>{!holidayCalendarConfigured ? "等待官方日历" : !isCurrentCalendarMonth ? "历史已锁定" : salaryStatus === "saving" ? "保存中…" : salaryStatus === "saved" ? "已保存" : "保存本月"}</button>
        </div>
      </div>
      {salaryStatus === "error" && <p className="salaryError" role="alert">保存失败，请稍后再试。</p>}
      {salaryTrendPoints.length > 0 && (
        <section className="salaryTrend" aria-label="已保存工资变化趋势">
          <div className="salaryLinePlot">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {salaryTrendPoints.length > 1 && <polyline className="salaryTrendLine" points={trendLine} vectorEffect="non-scaling-stroke" />}
            </svg>
            {salaryTrendPoints.map((point) => {
              const label = `${point.month.slice(0, 4)}年${Number(point.month.slice(5))}月，工资 ¥${money(point.value)}`;
              return <span className="salaryTrendPoint" key={point.month} style={{ left: `${point.x}%`, top: `${point.y}%` }} role="img" aria-label={label} title={label}><i aria-hidden="true" /></span>;
            })}
          </div>
          <div className="salaryTrendMonths" style={{ gridTemplateColumns: `repeat(${salaryTrendPoints.length}, minmax(0, 1fr))` }} aria-hidden="true">
            {salaryTrendPoints.map((point) => <b key={point.month}>{point.showMonth ? `${Number(point.month.slice(5))}月` : ""}</b>)}
          </div>
        </section>
      )}
      <div className="salaryHistory">
        {salaryLoadStatus === "loading" ? (
          <div className="moduleState"><span className="statePulse" /><p>正在读取工资记录…</p></div>
        ) : salaryLoadStatus === "error" ? (
          <div className="moduleState" role="alert"><p>工资记录读取失败，固定计算规则仍可使用。</p><button type="button" onClick={onReload}>重新加载</button></div>
        ) : salaryRecords.length === 0 ? (
          <p className="emptySalary">还没有工资记录，点击“保存本月”建立第一条记录。</p>
        ) : salaryRecords.map((record) => (
          <details className={`salaryRecord${record.month === calendarMonthKey && salaryRecordMismatch ? " outOfSync" : ""}`} key={record.month}>
            <summary>
              <div><b>{record.month.replace("-", " 年 ")} 月</b><small>{record.workdays} 个工作日 · 额外收入 ¥{money(record.extraIncome + record.bonus)}{record.month === calendarMonthKey && salaryRecordMismatch ? " · 待同步" : ""}</small></div>
              <strong>¥{money(record.netSalary)}</strong>
            </summary>
            <div className="salaryRecordDetails" aria-label={`${record.month} 工资详情`}>
              <span>应发<b>¥{money(record.grossSalary)}</b></span>
              <span>固定扣除<b>− ¥{money(record.deductions)}</b></span>
              <span>请假扣款<b>− ¥{money(record.leaveDeduction)}</b></span>
              <span>个税<b>− ¥{money(record.incomeTax)}</b></span>
              <span>额外收入<b>¥{money(record.extraIncome)}</b></span>
              <span>奖金<b>¥{money(record.bonus)}</b></span>
            </div>
          </details>
        ))}
      </div>
    </article>
  );
}
