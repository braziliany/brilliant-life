import type { CalendarDayView, CalendarNote } from "../../page-view.types";

type Props = {
  active: boolean;
  calendarEditing: boolean;
  monthLabel: string;
  calendarWorkdays: number;
  elapsedWorkdays: number;
  remainingWorkdays: number;
  holidayDays: number;
  makeupWorkdays: number;
  personalAdjustments: number;
  holidayCalendarConfigured: boolean;
  showAnnualStats: boolean;
  showCalendarNotes: boolean;
  calendarMonth: { year: number; month: number };
  calendarLoadStatus: "loading" | "ready" | "error";
  annualWorkdayTotal: number;
  annualWorkdays: number[];
  calendarNote: CalendarNote;
  calendarNoteStatus: "idle" | "loading" | "saving" | "saved" | "error";
  lastCalendarChange: unknown;
  savingDate: string | null;
  calendarOverridesCount: number;
  resettingCalendar: boolean;
  calendarRows: number;
  calendarDays: CalendarDayView[];
  onToggleAnnual: () => void;
  onToggleNotes: () => void;
  onToggleEditing: () => void;
  onChangeMonth: (offset: number) => void;
  onReload: () => void;
  onSelectAnnualMonth: (month: number) => void;
  onSaveNote: (event: React.FormEvent) => void;
  onNoteChange: (field: "scheduleNote" | "leaveNote" | "overtimeNote", value: string) => void;
  onUndo: () => void;
  onReset: () => void;
  onToggleDay: (day: number) => void;
};

export function WorkCalendarCard({ active, calendarEditing, monthLabel, calendarWorkdays, elapsedWorkdays, remainingWorkdays, holidayDays, makeupWorkdays, personalAdjustments, holidayCalendarConfigured, showAnnualStats, showCalendarNotes, calendarMonth, calendarLoadStatus, annualWorkdayTotal, annualWorkdays, calendarNote, calendarNoteStatus, lastCalendarChange, savingDate, calendarOverridesCount, resettingCalendar, calendarRows, calendarDays, onToggleAnnual, onToggleNotes, onToggleEditing, onChangeMonth, onReload, onSelectAnnualMonth, onSaveNote, onNoteChange, onUndo, onReset, onToggleDay }: Props) {
  return (
    <article id="time" className={`card calendar${calendarEditing ? " editing" : ""}${active ? " sectionActive" : ""}`}>
      <div className="cardHead">
        <div><p className="eyebrow light">TIME · 时间档案</p><h2>{monthLabel}</h2></div>
        <div className="calendarActions">
          <div className="monthSwitcher" aria-label="切换月份">
            <button type="button" onClick={() => onChangeMonth(-1)} aria-label="上个月">‹</button>
            <span aria-live="polite">{calendarMonth.month + 1}月</span>
            <button type="button" onClick={() => onChangeMonth(1)} aria-label="下个月">›</button>
          </div>
          <details className="moduleTools darkTools"><summary>工具</summary><div><button type="button" onClick={onToggleAnnual}>{showAnnualStats ? "返回月历" : "全年配置"}</button><button type="button" onClick={onToggleNotes}>{showCalendarNotes ? "返回月历" : "备注"}</button><button type="button" onClick={onToggleEditing}>{calendarEditing ? "完成编辑" : "编辑日期"}</button></div></details>
        </div>
      </div>
      <div className="calendarFacts"><span><b>{calendarWorkdays}</b> 工作日</span><span><b>{elapsedWorkdays}</b> 已过去</span><span><b>{remainingWorkdays}</b> 剩余</span><small>法定假日 {holidayDays} · 调休 {makeupWorkdays} · 个人调整 {personalAdjustments}</small></div>
      {!holidayCalendarConfigured && <div className="calendarEditHint" role="status"><span>{calendarMonth.year} 年官方节假日尚未配置，当前仅显示星期规则和个人修改，不能用于保存工资。</span></div>}
      {calendarLoadStatus === "loading" ? (
        <div className="moduleState darkState"><span className="statePulse" /><p>正在读取工作日历…</p></div>
      ) : calendarLoadStatus === "error" ? (
        <div className="moduleState darkState" role="alert"><p>工作日历读取失败，当前数据未被覆盖。</p><button type="button" onClick={onReload}>重新加载</button></div>
      ) : showAnnualStats ? (
        <div className="annualCalendar">
          <div className="annualTotal"><strong>{annualWorkdayTotal}</strong><span>个工作日</span><small>{calendarMonth.year} 年度统计</small></div>
          <div className="annualMonths">{annualWorkdays.map((count, month) => (
            <button type="button" key={month} onClick={() => onSelectAnnualMonth(month)}>
              <span>{month + 1}月</span><strong>{count}</strong><small>天</small>
            </button>
          ))}</div>
        </div>
      ) : showCalendarNotes ? (
        <form className="calendarNotesForm" onSubmit={onSaveNote}>
          <p>{monthLabel}工作备注会自动保存在云端</p>
          <label><span><i className="scheduleNoteMark" />排班</span><textarea maxLength={500} rows={2} placeholder="例如：本月夜班、外出或临时排班" value={calendarNote.scheduleNote} onChange={(event) => onNoteChange("scheduleNote", event.target.value)} /></label>
          <label><span><i className="leaveNoteMark" />请假</span><textarea maxLength={500} rows={2} placeholder="例如：8月12日下午请假" value={calendarNote.leaveNote} onChange={(event) => onNoteChange("leaveNote", event.target.value)} /></label>
          <label><span><i className="overtimeNoteMark" />加班</span><textarea maxLength={500} rows={2} placeholder="例如：8月19日加班3小时" value={calendarNote.overtimeNote} onChange={(event) => onNoteChange("overtimeNote", event.target.value)} /></label>
          <div className="calendarNotesFooter"><span className={calendarNoteStatus === "error" ? "noteError" : ""}>{calendarNoteStatus === "loading" ? "读取中…" : calendarNoteStatus === "saved" ? "已保存" : calendarNoteStatus === "error" ? "保存失败，请重试" : ""}</span><button type="submit" disabled={calendarNoteStatus === "saving" || calendarNoteStatus === "loading"}>{calendarNoteStatus === "saving" ? "保存中…" : "保存备注"}</button></div>
        </form>
      ) : <>
        {calendarEditing && <div className="calendarEditHint"><span>点击日期切换工作或休息</span><div><button type="button" onClick={onUndo} disabled={!lastCalendarChange || savingDate !== null}>撤销</button><button type="button" className="resetCalendar" onClick={onReset} disabled={calendarOverridesCount === 0 || resettingCalendar}>{resettingCalendar ? "恢复中…" : "恢复官方"}</button></div></div>}
        <div className="week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div className={`days${calendarRows === 6 ? " sixRows" : ""}`}>
          {calendarDays.map((item) => item.day === null ? (
            <span className="emptyDay" aria-hidden="true" key={item.key} />
          ) : (
            <button type="button" key={item.key} className={item.className} aria-label={item.ariaLabel} title={item.title} onClick={() => onToggleDay(item.day!)} disabled={item.disabled}>
              <span className="dayNumber">{item.day}</span>
              {item.holiday && <small className="holidayName">{item.holiday}</small>}
            </button>
          ))}
        </div>
        <div className="calendarLegend">
          <span><i className="todayLine" />今天</span>
          <span><i className="workLine" />工作日</span>
          <span><i className="holidayLine" />法定假日</span>
          <span><i className="makeupLine" />调休上班</span>
          <span><i className="weekendLine" />周末</span>
          <span><i className="personalLine" />个人修改</span>
        </div>
      </>}
    </article>
  );
}
