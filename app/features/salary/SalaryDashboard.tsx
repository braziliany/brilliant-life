import type { SalaryRecord } from "../../page-view.types";

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
  salaryTrend: SalaryRecord[];
  salaryTrendMax: number;
  isCurrentCalendarMonth: boolean;
  holidayCalendarConfigured: boolean;
  money: (value: number) => string;
  onSave: () => void;
  onExport: () => void;
  onReload: () => void;
};

export function SalaryDashboard({ active, monthLabel, calendarMonthKey, workdays, dailyRate, deductions, taxThreshold, taxRate, leaveDeduction, grossSalary, taxableIncome, incomeTax, netSalary, salaryRecordMismatch, selectedSalaryRecord, salaryStatus, salaryRecords, yearSavedMonths, yearTotalNetSalary, yearTotalIncomeTax, salaryLoadStatus, salaryTrend, salaryTrendMax, isCurrentCalendarMonth, holidayCalendarConfigured, money, onSave, onExport, onReload }: Props) {
  return (
    <article id="finance" className={`card salary${active ? " sectionActive" : ""}`}>
      <div className="salaryIntro">
        <div>
          <p className="eyebrow">FINANCE · 工资事实</p>
          <h2>{monthLabel}工资</h2>
          <p className="salarySubtitle">日薪 {money(dailyRate)} 元，固定扣除 {money(deductions)} 元，起征点 {money(taxThreshold)} 元，税率 {taxRate}%</p>
        </div>
        <label className="workdayInput"><span>{monthLabel}工作日</span><input type="number" readOnly value={workdays} /><b>天</b></label>
      </div>
      <div className="salaryYearFacts"><div><span>今年已保存</span><strong>{yearSavedMonths}</strong><small>个月</small></div><div><span>累计实发</span><strong>{yearSavedMonths ? `¥ ${money(yearTotalNetSalary)}` : "—"}</strong><small>仅工资快照</small></div><div><span>累计个税</span><strong>{yearSavedMonths ? `¥ ${money(yearTotalIncomeTax)}` : "—"}</strong><small>仅工资快照</small></div></div>
      <div className="salarySummary">
        <div className="netPay"><span>{holidayCalendarConfigured ? "当前日历预计实发" : "非官方日历估算"}</span><strong>¥ {money(netSalary)}</strong><small>按 {workdays} 个工作日实时计算</small></div>
        <div className="salaryMetrics">
          <div><span>应发工资</span><b>¥ {money(grossSalary)}</b><small>工作日 × 日薪</small></div>
          <div><span>全部扣除</span><b>− ¥ {money(deductions + leaveDeduction)}</b><small>固定扣除</small></div>
          <div><span>计税收入</span><b>¥ {money(taxableIncome)}</b><small>扣除后再减 ¥{money(taxThreshold)}</small></div>
          <div><span>个人所得税</span><b>− ¥ {money(incomeTax)}</b><small>计税收入 × {taxRate}%</small></div>
        </div>
      </div>
      <div className="salaryFormula"><span>计算公式</span><code>实发 = 工作日 × 日薪 + 额外收入 + 奖金 − 固定扣除 − 请假扣款 − 个税</code></div>
      {salaryRecordMismatch && selectedSalaryRecord && (
        <div className="salaryMismatch" role="status">
          <div><b>{monthLabel}的日历与已保存工资不一致</b><span>当前日历 {workdays} 天，预计实发 ¥{money(netSalary)}；历史记录 {selectedSalaryRecord.workdays} 天，已保存实发 ¥{money(selectedSalaryRecord.netSalary)}。</span></div>
          <button type="button" onClick={onSave} disabled={salaryStatus === "saving"}>{salaryStatus === "saving" ? "同步中…" : `同步为 ${workdays} 天`}</button>
        </div>
      )}
      <div className="salaryHistoryHead">
        <div><p className="eyebrow">月度档案</p><h3>工资历史</h3></div>
        <div className="salaryHistoryActions">
          <button type="button" className="exportSalary" onClick={onExport} disabled={salaryRecords.length === 0}>导出 CSV</button>
          <button type="button" className="saveSalary" onClick={onSave} disabled={salaryStatus === "saving" || !isCurrentCalendarMonth || !holidayCalendarConfigured}>{!holidayCalendarConfigured ? "等待官方日历" : !isCurrentCalendarMonth ? "历史已锁定" : salaryStatus === "saving" ? "保存中…" : salaryStatus === "saved" ? "已保存" : "保存本月"}</button>
        </div>
      </div>
      {salaryStatus === "error" && <p className="salaryError" role="alert">保存失败，请稍后再试。</p>}
      {salaryTrend.length > 0 && (
        <section className="salaryTrend" aria-label="最近六个月工资趋势">
          <div className="trendLegend"><span><i className="grossKey" />应发</span><span><i className="deductionKey" />扣除</span><span><i className="taxKey" />个税</span><span><i className="netKey" />实发</span></div>
          <div className="trendPlot">
            {salaryTrend.map((record) => (
              <div className="trendMonth" key={record.month}>
                <div className="trendBars" aria-label={`${record.month}：应发${money(record.grossSalary)}元，扣除${money(record.deductions)}元，个税${money(record.incomeTax)}元，实发${money(record.netSalary)}元`}>
                  <i className="grossBar" style={{ height: `${Math.max(4, record.grossSalary / salaryTrendMax * 100)}%` }} />
                  <i className="deductionBar" style={{ height: `${Math.max(4, record.deductions / salaryTrendMax * 100)}%` }} />
                  <i className="taxBar" style={{ height: `${Math.max(4, record.incomeTax / salaryTrendMax * 100)}%` }} />
                  <i className="netBar" style={{ height: `${Math.max(4, record.netSalary / salaryTrendMax * 100)}%` }} />
                </div>
                <b>{Number(record.month.slice(5))}月</b>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="salaryHistory">
        {salaryLoadStatus === "loading" ? (
          <div className="moduleState"><span className="statePulse" /><p>正在读取工资记录…</p></div>
        ) : salaryLoadStatus === "error" ? (
          <div className="moduleState" role="alert"><p>工资记录读取失败，固定计算规则仍可使用。</p><button type="button" onClick={onReload}>重新加载</button></div>
        ) : salaryRecords.length === 0 ? (
          <p className="emptySalary">还没有工资记录，点击“保存本月”建立第一条档案。</p>
        ) : salaryRecords.map((record) => (
          <div className={`salaryRecord${record.month === calendarMonthKey && salaryRecordMismatch ? " outOfSync" : ""}`} key={record.month}>
            <div><b>{record.month.replace("-", " 年 ")} 月</b><small>{record.workdays} 个工作日 · 加项 ¥{money(record.extraIncome + record.bonus)}{record.month === calendarMonthKey && salaryRecordMismatch ? " · 待同步" : ""}</small></div>
            <span>应发 ¥{money(record.grossSalary)}</span><span>个税 ¥{money(record.incomeTax)}</span><strong>已保存实发 ¥{money(record.netSalary)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}
