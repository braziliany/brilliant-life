import { createRoot } from "react-dom/client";
import { useState } from "react";
import { CalendarDateEditor } from "../../app/features/calendar/CalendarDateEditor";
import { WorkCalendarCard } from "../../app/features/calendar/WorkCalendarCard";
import { calculateAnnualWorkdays, countCalendarMonthWorkdays, getCalendarMonthShape, resolveCalendarDay, type CalendarWorkRecord, type CalendarWorkRecords } from "../../app/features/calendar/domain";
import { buildCalendarDayView } from "../../app/features/calendar/day-view";
import { useAnnualCalendar } from "../../app/features/calendar/useAnnualCalendar";
import "../../app/globals.css";

// Component-only transport: browser tests control HTTP responses. This fixture
// deliberately does not connect to D1 or claim production API/E2E coverage.
type SavedDay = { arrangement?: boolean; record?: CalendarWorkRecord };
type SavedDays = Record<string, SavedDay>;
const storageKey = "calendar-component-saved-days";
declare global {
  interface Window {
    calendarFixture: {
      updateSaved: (date: string, value: SavedDay) => void;
    };
  }
}

function EditorFixture({ mobile = false }: { mobile?: boolean }) {
  const [saved, setSaved] = useState<SavedDays>(() => JSON.parse(localStorage.getItem(storageKey) || "{}"));
  const [date, setDate] = useState<string | null>(mobile ? "2026-10-17" : "2026-07-05");
  const [month, setMonth] = useState(mobile ? "2026-10" : "2026-07");
  const [busy, setBusy] = useState(false);
  const persist = (dateKey: string, value: SavedDay) => setSaved(current => {
    const next = { ...current, [dateKey]: value };
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
  window.calendarFixture = { updateSaved: persist };
  const save = async (kind: "arrangement" | "record", value: boolean | CalendarWorkRecord | null) => {
    if (!date) throw new Error("No selected date");
    const dateKey = date;
    setBusy(true);
    try {
      const response = await fetch(`/fixture/save?kind=${kind}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey, value }),
      });
      if (!response.ok) throw new Error("Controlled save failure");
      const { value: storedValue } = await response.json();
      setSaved(current => {
        const nextDay = { ...current[dateKey] };
        if (storedValue === null) delete nextDay[kind];
        else if (kind === "arrangement") nextDay.arrangement = storedValue;
        else nextDay.record = storedValue;
        const next = { ...current, [dateKey]: nextDay };
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    } finally { setBusy(false); }
  };
  const editor = date && <CalendarDateEditor key={date} date={date} officialLabel="周末" arrangement={saved[date]?.arrangement}
    record={saved[date]?.record} busy={busy} onArrange={value => save("arrangement", value)}
    onRecord={value => save("record", value)} onClose={() => setDate(null)} />;
  if (mobile) return <main className="pageShell">
    <div className="dashboard">
      <div className="grid">
        <article className="card calendar editing" data-testid="mobile-calendar-card">
          <div className="cardHead"><div><p className="eyebrow light">TIME · 工作时间</p><h2>2026年10月</h2></div></div>
          {editor}
        </article>
      </div>
      <pre data-testid="saved-data" hidden>{JSON.stringify(saved)}</pre>
    </div>
  </main>;
  return <main>
    <h1>Calendar component interactions</h1>
    <p data-testid="selected-month">{month}</p>
    <button disabled={busy} onClick={() => setDate(`${month}-05`)}>选择五日</button>
    <button disabled={busy} onClick={() => setDate(`${month}-06`)}>选择六日</button>
    <button disabled={busy} onClick={() => { setMonth("2026-08"); setDate(null); }}>切换八月</button>
    {editor}
    <pre data-testid="saved-data">{JSON.stringify(saved)}</pre>
  </main>;
}

function AnnualFixture() {
  const [year, setYear] = useState(2026);
  const [revision, setRevision] = useState(0);
  const annual = useAnnualCalendar(year, true, revision);
  const counts = calculateAnnualWorkdays(year, annual.overrides ?? {});
  return <main>
    <h1>Annual calendar component interactions</h1>
    <button onClick={() => setYear(2026)}>选择2026年</button>
    <button onClick={() => setYear(2027)}>选择2027年</button>
    <button onClick={() => setRevision(value => value + 1)}>重新读取当前年</button>
    <output data-testid="annual-load-status">{annual.status}</output>
    <WorkCalendarCard active={true} calendarEditing={false} monthLabel={`${year}年7月`}
      calendarWorkdays={0} elapsedWorkdays={0} remainingWorkdays={0} holidayDays={0}
      makeupWorkdays={0} personalAdjustments={0} holidayCalendarConfigured={year === 2026}
      showAnnualStats={true} showCalendarNotes={false} calendarMonth={{ year, month: 6 }}
      calendarLoadStatus="ready" annualLoadStatus={annual.status} annualHasData={annual.overrides !== null}
      annualWorkdayTotal={counts.totalWorkdays} annualWorkdays={counts.monthlyWorkdays}
      calendarNote={{ month: `${year}-07`, scheduleNote: "", leaveNote: "", overtimeNote: "" }}
      calendarNoteStatus="idle" lastCalendarChange={null} savingDate={null} calendarOverridesCount={0}
      resettingCalendar={false} calendarRows={5} calendarDays={[]}
      onToggleAnnual={() => {}} onToggleNotes={() => {}} onToggleEditing={() => {}}
      onChangeMonth={() => {}} onReload={() => {}} onReloadAnnual={annual.retry}
      onSelectAnnualMonth={() => {}} onSaveNote={event => event.preventDefault()}
      onNoteChange={() => {}} onUndo={() => {}} onReset={() => {}} onToggleDay={() => {}} />
  </main>;
}

function MonthVisualFixture() {
  const [todayKey, setTodayKey] = useState("2026-10-18");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const overrides = { "2026-10-01": false, "2026-10-10": false, "2026-10-12": true, "2026-10-17": true, "2026-10-18": false };
  const records: CalendarWorkRecords = {
    "2026-10-01": { worked: true, hours: 8 }, "2026-10-12": { worked: false, hours: 0 },
    "2026-10-18": { worked: true, hours: 0.5 }, "2026-10-19": { worked: true, hours: null },
  };
  const shape = getCalendarMonthShape(2026, 9);
  const days = shape.calendarDays.map((day, index) => day === null ? { key: `empty-${index}`, day: null }
    : buildCalendarDayView({ year: 2026, month: 9, day, todayKey, overrides, records, editing: true, busy: false }));
  const date = selectedDay === null ? null : `2026-10-${String(selectedDay).padStart(2, "0")}`;
  const official = selectedDay === null ? null : resolveCalendarDay(2026, 9, selectedDay, {});
  const readOnly = async () => { throw new Error("Visual fixture does not persist business data"); };
  return <main className="pageShell"><div className="dashboard">
    <label>测试 Today 日期 <select aria-label="测试 Today 日期" value={todayKey} onChange={event => setTodayKey(event.target.value)}>
      {[1, 3, 8, 10, 11, 12, 17, 18, 19].map(day => { const key = `2026-10-${String(day).padStart(2, "0")}`; return <option key={key} value={key}>{key}</option>; })}
    </select></label>
    <div className="grid"><WorkCalendarCard active={false} calendarEditing={true} monthLabel="2026年10月"
      calendarWorkdays={countCalendarMonthWorkdays(2026, 9, overrides, records)} elapsedWorkdays={0} remainingWorkdays={0}
      holidayDays={7} makeupWorkdays={1} personalAdjustments={5} holidayCalendarConfigured={true}
      showAnnualStats={false} showCalendarNotes={false} calendarMonth={{ year: 2026, month: 9 }}
      calendarLoadStatus="ready" annualLoadStatus="idle" annualHasData={false} annualWorkdayTotal={0} annualWorkdays={[]}
      calendarNote={{ month: "2026-10", scheduleNote: "", leaveNote: "", overtimeNote: "" }}
      calendarNoteStatus="idle" lastCalendarChange={null} savingDate={null} calendarOverridesCount={5}
      resettingCalendar={false} calendarRows={shape.calendarRows} calendarDays={days}
      editor={date && official && <CalendarDateEditor key={date} date={date} officialLabel={official.holiday ? `${official.holiday}法定休假` : official.makeup ? "官方调休上班" : official.officialWorkday ? "工作日" : "周末休息"}
        arrangement={overrides[date as keyof typeof overrides]} record={records[date]} busy={false} onArrange={readOnly} onRecord={readOnly} onClose={() => setSelectedDay(null)} />}
      onToggleAnnual={() => {}} onToggleNotes={() => {}} onToggleEditing={() => {}} onChangeMonth={() => {}}
      onReload={() => {}} onReloadAnnual={() => {}} onSelectAnnualMonth={() => {}} onSaveNote={event => event.preventDefault()}
      onNoteChange={() => {}} onUndo={() => {}} onReset={() => {}} onToggleDay={setSelectedDay} /></div>
  </div></main>;
}

const fixture = new URLSearchParams(location.search).get("fixture");
createRoot(document.getElementById("root")!).render(
  fixture === "month-visual" ? <MonthVisualFixture /> : fixture === "annual" ? <AnnualFixture /> : <EditorFixture mobile={fixture === "mobile"} />,
);
