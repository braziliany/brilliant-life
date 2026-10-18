import { useEffect, useId, useRef, useState } from "react";
import type { CalendarWorkRecord } from "./domain";

function useFormDraft<T>(serverValue: T) {
  const serialized = JSON.stringify(serverValue);
  const [draft, setDraft] = useState({ value: serverValue, baseline: serverValue, status: "idle", externalUpdate: false });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const incoming = JSON.parse(serialized) as T;
    setDraft(current => {
      if (JSON.stringify(current.baseline) === serialized) return current;
      const clean = JSON.stringify(current.value) === JSON.stringify(current.baseline);
      if (clean && current.status !== "saving") return { value: incoming, baseline: incoming, status: "idle", externalUpdate: false };
      return { ...current, baseline: incoming, externalUpdate: JSON.stringify(current.value) !== serialized };
    });
  }, [serialized]);
  return {
    ...draft,
    edit: (value: T) => setDraft(current => ({ ...current, value, status: "idle", externalUpdate: current.externalUpdate && JSON.stringify(value) !== JSON.stringify(current.baseline) })),
    acceptServer: () => setDraft(current => ({ value: current.baseline, baseline: current.baseline, status: "idle", externalUpdate: false })),
    save: async (action: (value: T) => Promise<void>, normalize: (value: T) => T = value => value) => {
      const submitted = draft.value;
      setDraft(current => ({ ...current, status: "saving" }));
      try {
        await action(submitted);
        const committed = normalize(submitted);
        if (mounted.current) setDraft({ value: committed, baseline: committed, status: "saved", externalUpdate: false });
      } catch {
        if (mounted.current) setDraft(current => ({ ...current, status: "error" }));
      }
    },
  };
}

export function CalendarDateEditor({ date, officialLabel, arrangement, record, busy, onArrange, onRecord, onClose }: {
  date: string;
  officialLabel: string;
  arrangement: boolean | undefined;
  record?: CalendarWorkRecord;
  busy: boolean;
  onArrange: (value: boolean | null) => Promise<void>;
  onRecord: (value: CalendarWorkRecord | null) => Promise<void>;
  onClose: () => void;
}) {
  // Parent identity is the date only. A saved plan must not remount the actual-work draft.
  const plan = useFormDraft(arrangement === undefined ? "default" : arrangement ? "work" : "rest");
  const actual = useFormDraft({ actual: !record ? "unknown" : record.worked ? "work" : "rest", hours: record?.hours == null ? "" : String(record.hours) });
  const controlId = useId();
  const lock = useRef(false);
  const disabled = busy || plan.status === "saving" || actual.status === "saving";
  const run = async (action: () => Promise<void>) => {
    if (disabled || lock.current) return;
    lock.current = true;
    try { await action(); } finally { lock.current = false; }
  };
  const statusText = (status: string) => status === "saving" ? "保存中…" : status === "saved" ? "已保存" : status === "error" ? "保存失败，请重试；草稿已保留。" : "";
  const [, month, day] = date.split("-");
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(`${date}T00:00:00Z`).getUTCDay()];
  return <section className="calendarDateEditor" aria-label={`${date}日期编辑`}>
    <header className="calendarEditorHeader">
      <div>
        <h3><time dateTime={date}>{Number(month)}月{Number(day)}日 · {weekday}</time></h3>
        <p className="calendarEditorHint">官方 · {officialLabel}</p>
      </div>
      <button className="calendarEditorClose" type="button" disabled={disabled} onClick={onClose} aria-label="关闭日期编辑">关闭</button>
    </header>
    <form aria-label="我的安排表单" aria-busy={plan.status === "saving"} onSubmit={event => { event.preventDefault(); void run(() => plan.save(value => onArrange(value === "default" ? null : value === "work"))); }}>
      <div className="calendarEditorFormHead">
        <h4 id={`${controlId}-plan`}>我的安排</h4>
        <button className="calendarEditorSave" disabled={disabled} type="submit">保存安排</button>
      </div>
      <fieldset className="calendarEditorPlanChoices" aria-labelledby={`${controlId}-plan`} aria-describedby={`${controlId}-plan-hint`}>
        {([['work', '上班'], ['rest', '休息'], ['default', '默认']] as const).map(([value, label]) => <label key={value}>
          <input type="radio" name={`${controlId}-plan`} value={value} checked={plan.value === value} disabled={disabled} onChange={() => plan.edit(value)} />
          <span>{label}</span>
        </label>)}
      </fieldset>
      <p className="calendarEditorHint" id={`${controlId}-plan-hint`}>默认跟随官方日历，保留实际出勤。</p>
      {plan.status !== "idle" && <p className={`calendarEditorStatus ${plan.status}`} role={plan.status === "error" ? "alert" : "status"}>{statusText(plan.status)}</p>}
      {plan.externalUpdate && <div className="calendarEditorConflict" role="status"><p>服务器安排已更新，未保存草稿已保留。</p><button type="button" disabled={disabled} onClick={plan.acceptServer}>使用服务器安排</button></div>}
    </form>
    <form aria-label="实际记录表单" aria-busy={actual.status === "saving"} onSubmit={event => { event.preventDefault(); void run(() => actual.save(value => onRecord(value.actual === "unknown" ? null : { worked: value.actual === "work", hours: value.hours.trim() === "" ? null : Number(value.hours) }), value => ({ ...value, hours: value.hours.trim() === "" ? "" : String(Number(value.hours)) }))); }}>
      <div className="calendarEditorFormHead">
        <h4>实际上班</h4>
        <button className="calendarEditorSave calendarEditorSavePrimary" disabled={disabled} type="submit">保存记录</button>
      </div>
      <div className={`calendarEditorFields${actual.value.actual === "unknown" ? " single" : ""}`}>
        <label className="calendarEditorField">出勤状态
          <select aria-label="出勤状态" value={actual.value.actual} disabled={disabled} onChange={event => actual.edit({ actual: event.target.value, hours: "" })}>
            <option value="unknown">未记录</option><option value="work">上班</option><option value="rest">未上班</option>
          </select>
        </label>
        {actual.value.actual !== "unknown" && <label className="calendarEditorField" htmlFor={`${controlId}-hours`}>工作时长
          <span className="calendarEditorHours"><input id={`${controlId}-hours`} type="number" inputMode="decimal" aria-label="工作时长（小时）" min="0" max={actual.value.actual === "work" ? "24" : "0"} step="any" placeholder="未填写" aria-describedby={`${controlId}-hours-hint`} value={actual.value.hours} disabled={disabled} onChange={event => actual.edit({ ...actual.value, hours: event.target.value })} /><span aria-hidden="true">小时</span></span>
        </label>}
      </div>
      <p className="calendarEditorHint" id={`${controlId}-hours-hint`}>{actual.value.actual === "unknown" ? "保存“未记录”会清除实际出勤。" : actual.value.actual === "rest" ? "未上班可填 0 小时，留空表示未知。" : "可记录短班，时长留空表示未知。"}</p>
      {actual.status !== "idle" && <p className={`calendarEditorStatus ${actual.status}`} role={actual.status === "error" ? "alert" : "status"}>{statusText(actual.status)}</p>}
      {actual.externalUpdate && <div className="calendarEditorConflict" role="status"><p>服务器实际记录已更新，未保存草稿已保留。</p><button type="button" disabled={disabled} onClick={actual.acceptServer}>使用服务器实际记录</button></div>}
    </form>
  </section>;
}
