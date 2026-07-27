"use client";

import { useEffect, useState } from "react";

type HealthDaily = {
  date: string;
  steps: number;
  activeEnergyKcal: number;
  restingEnergyKcal: number;
  exerciseMinutes: number;
  workoutCount: number;
};

type SalaryRecord = {
  month: string;
  workdays: number;
  dailyRate: number;
  grossSalary: number;
  deductions: number;
  taxThreshold: number;
  taxRate: number;
  taxableIncome: number;
  extraIncome: number;
  bonus: number;
  leaveDeduction: number;
  incomeTax: number;
  netSalary: number;
};

type SalarySettings = {
  dailyRate: number;
  deductions: number;
  taxThreshold: number;
  taxRate: number;
};

type SalaryAdjustments = {
  extraIncome: number;
  bonus: number;
  leaveDeduction: number;
};

const getShanghaiDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")) - 1,
    day: Number(read("day")),
    weekday: read("weekday"),
  };
};

const habits = [
  { icon: "↗", name: "晨间拉伸", coach: "Alice McCain", done: 9, total: 12 },
  { icon: "●", name: "瑜伽训练", coach: "Jennifer Lubin", done: 6, total: 10 },
  { icon: "◆", name: "肩颈放松", coach: "Johnson Cooper", done: 4, total: 8 },
  { icon: "⌁", name: "核心训练", coach: "自主训练", done: 8, total: 10 },
];

const holidayRanges = [
  ["2026-01-01", "2026-01-03", "元旦"],
  ["2026-02-15", "2026-02-23", "春节"],
  ["2026-04-04", "2026-04-06", "清明"],
  ["2026-05-01", "2026-05-05", "劳动节"],
  ["2026-06-19", "2026-06-21", "端午"],
  ["2026-09-25", "2026-09-27", "中秋"],
  ["2026-10-01", "2026-10-07", "国庆"],
] as const;

const makeupWorkdays = new Set([
  "2026-01-04",
  "2026-02-14",
  "2026-02-28",
  "2026-05-09",
  "2026-09-20",
  "2026-10-10",
]);

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const holidayName = (date: string) =>
  holidayRanges.find(([start, end]) => date >= start && date <= end)?.[2] ?? null;

const defaultIsWorkday = (year: number, month: number, day: number) => {
  const key = dateKey(year, month, day);
  if (makeupWorkdays.has(key)) return true;
  if (holidayName(key)) return false;
  const weekday = new Date(year, month, day).getDay();
  return weekday !== 0 && weekday !== 6;
};

function Icon({ children, active = false, label, onClick }: { children: React.ReactNode; active?: boolean; label: string; onClick: () => void }) {
  return <button type="button" className={`navIcon${active ? " active" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("overview");
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [calendarEditing, setCalendarEditing] = useState(false);
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, boolean>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [lastCalendarChange, setLastCalendarChange] = useState<{ date: string; previous: boolean; hadOverride: boolean } | null>(null);
  const [resettingCalendar, setResettingCalendar] = useState(false);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [salaryStatus, setSalaryStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [salarySettings, setSalarySettings] = useState<SalarySettings>({ dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 3 });
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [salaryAdjustments, setSalaryAdjustments] = useState<SalaryAdjustments>({ extraIncome: 0, bonus: 0, leaveDeduction: 0 });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = getShanghaiDate();
    return { year: now.year, month: now.month };
  });
  const today = getShanghaiDate();
  const todayKey = dateKey(today.year, today.month, today.day);
  const firstDayOffset = (new Date(calendarMonth.year, calendarMonth.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const calendarRows = Math.ceil(calendarDays.length / 7);
  const calendarWorkdays = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1
  ).filter((day) => {
    const key = dateKey(calendarMonth.year, calendarMonth.month, day);
    return calendarOverrides[key] ?? defaultIsWorkday(calendarMonth.year, calendarMonth.month, day);
  }).length;
  const monthLabel = `${calendarMonth.year}年${calendarMonth.month + 1}月`;
  const workdays = calendarWorkdays;
  const stepGoal = 8500;
  const steps = health?.steps ?? 5201;
  const stepProgress = Math.min(100, Math.round((steps / stepGoal) * 100));
  const activeEnergy = Math.round(health?.activeEnergyKcal ?? 0);
  const totalEnergy = health && health.restingEnergyKcal > 0
    ? Math.round(health.activeEnergyKcal + health.restingEnergyKcal)
    : null;
  const exerciseHours = ((health?.exerciseMinutes ?? 138) / 60).toFixed(1);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health data unavailable");
        return response.json() as Promise<{ health: HealthDaily | null }>;
      })
      .then(({ health: latest }) => {
        setHealth(latest);
      })
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    const month = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
    fetch(`/api/calendar?month=${month}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Calendar data unavailable");
        return response.json() as Promise<{ overrides: Array<{ date: string; isWorkday: boolean }> }>;
      })
      .then(({ overrides }) => {
        setCalendarOverrides(Object.fromEntries(overrides.map((item) => [item.date, item.isWorkday])));
      })
      .catch(() => setCalendarOverrides({}));
  }, [calendarMonth]);

  useEffect(() => {
    fetch("/api/salary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Salary history unavailable");
        return response.json() as Promise<{ records: SalaryRecord[]; settings: SalarySettings }>;
      })
      .then(({ records, settings }) => {
        setSalaryRecords(records);
        setSalarySettings(settings);
      })
      .catch(() => setSalaryRecords([]));
  }, []);
  useEffect(() => {
    const month = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
    const record = salaryRecords.find((item) => item.month === month);
    setSalaryAdjustments(record
      ? { extraIncome: record.extraIncome, bonus: record.bonus, leaveDeduction: record.leaveDeduction }
      : { extraIncome: 0, bonus: 0, leaveDeduction: 0 });
  }, [calendarMonth, salaryRecords]);
  const { dailyRate, deductions, taxThreshold, taxRate } = salarySettings;
  const { extraIncome, bonus, leaveDeduction } = salaryAdjustments;
  const grossSalary = workdays * dailyRate + extraIncome + bonus;
  const taxableIncome = Math.max(0, grossSalary - deductions - leaveDeduction - taxThreshold);
  const incomeTax = taxableIncome * taxRate / 100;
  const netSalary = grossSalary - deductions - leaveDeduction - incomeTax;
  const salaryTrend = [...salaryRecords].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  const salaryTrendMax = Math.max(1, ...salaryTrend.map((record) => record.grossSalary));
  const money = (value: number) =>
    new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const navigateTo = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const changeCalendarMonth = (offset: number) => {
    setLastCalendarChange(null);
    setCalendarMonth((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const toggleWorkday = async (day: number) => {
    if (!calendarEditing) return;
    const key = dateKey(calendarMonth.year, calendarMonth.month, day);
    const hadOverride = Object.hasOwn(calendarOverrides, key);
    const current = calendarOverrides[key] ?? defaultIsWorkday(calendarMonth.year, calendarMonth.month, day);
    const next = !current;
    setCalendarOverrides((values) => ({ ...values, [key]: next }));
    setSavingDate(key);
    try {
      const response = await fetch("/api/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: key, isWorkday: next }),
      });
      if (!response.ok) throw new Error("Save failed");
      setLastCalendarChange({ date: key, previous: current, hadOverride });
    } catch {
      setCalendarOverrides((values) => ({ ...values, [key]: current }));
    } finally {
      setSavingDate(null);
    }
  };

  const undoCalendarChange = async () => {
    if (!lastCalendarChange) return;
    const change = lastCalendarChange;
    setSavingDate(change.date);
    try {
      const response = await fetch("/api/calendar", {
        method: change.hadOverride ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change.hadOverride ? { date: change.date, isWorkday: change.previous } : { date: change.date }),
      });
      if (!response.ok) throw new Error("Undo failed");
      setCalendarOverrides((values) => {
        const next = { ...values };
        if (change.hadOverride) next[change.date] = change.previous;
        else delete next[change.date];
        return next;
      });
      setLastCalendarChange(null);
    } catch {
      // Keep the latest change available so the user can retry undoing it.
    } finally {
      setSavingDate(null);
    }
  };

  const resetOfficialCalendar = async () => {
    if (Object.keys(calendarOverrides).length === 0) return;
    const month = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
    if (!window.confirm(`确定清除${monthLabel}的个人修改并恢复官方日历吗？`)) return;
    setResettingCalendar(true);
    try {
      const response = await fetch("/api/calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!response.ok) throw new Error("Reset failed");
      setCalendarOverrides({});
      setLastCalendarChange(null);
    } catch {
      // Keep existing overrides when the reset request fails.
    } finally {
      setResettingCalendar(false);
    }
  };

  const saveSalaryRecord = async () => {
    const month = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
    setSalaryStatus("saving");
    try {
      const response = await fetch("/api/salary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, workdays, ...salaryAdjustments }),
      });
      if (!response.ok) throw new Error("Save failed");
      const { record } = await response.json() as { record: SalaryRecord };
      setSalaryRecords((records) => [record, ...records.filter((item) => item.month !== record.month)].slice(0, 12));
      setSalaryStatus("saved");
    } catch {
      setSalaryStatus("error");
    }
  };

  const saveSalarySettings = async () => {
    setSettingsStatus("saving");
    try {
      const response = await fetch("/api/salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salarySettings),
      });
      if (!response.ok) throw new Error("Save failed");
      const { settings } = await response.json() as { settings: SalarySettings };
      setSalarySettings(settings);
      setSettingsStatus("saved");
    } catch {
      setSettingsStatus("error");
    }
  };

  const exportSalaryRecords = () => {
    if (salaryRecords.length === 0) return;
    const headers = ["月份", "工作日", "日薪", "固定扣除", "起征点", "税率(%)", "额外收入", "奖金", "请假扣款", "应发工资", "计税收入", "个人所得税", "实发工资"];
    const rows = salaryRecords.map((record) => [
      record.month,
      record.workdays,
      record.dailyRate,
      record.deductions,
      record.taxThreshold,
      record.taxRate,
      record.extraIncome,
      record.bonus,
      record.leaveDeduction,
      record.grossSalary,
      record.taxableIncome,
      record.incomeTax,
      record.netSalary,
    ]);
    const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `璀璨人生-工资记录-${today.year}-${String(today.month + 1).padStart(2, "0")}-${String(today.day).padStart(2, "0")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="pageShell">
      <section className="dashboard">
        <aside className="sidebar" aria-label="主导航">
          <button className="brand" type="button" onClick={() => navigateTo("overview")} aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></button>
          <nav>
            <Icon label="今日概览" active={activeSection === "overview"} onClick={() => navigateTo("overview")}>⌂</Icon>
            <Icon label="工作日历" active={activeSection === "calendar"} onClick={() => navigateTo("calendar")}>◔</Icon>
            <Icon label="目标进度" active={activeSection === "goals"} onClick={() => navigateTo("goals")}>⚑</Icon>
            <Icon label="习惯列表" active={activeSection === "habits"} onClick={() => navigateTo("habits")}>□</Icon>
            <Icon label="工资计算" active={activeSection === "salary"} onClick={() => navigateTo("salary")}>¥</Icon>
          </nav>
          <div className="sideBottom"><Icon label="通知" onClick={() => navigateTo("habits")}>♢</Icon><Icon label="设置" onClick={() => navigateTo("goals")}>⚙</Icon><span className="avatar">AM</span></div>
        </aside>

        <div className="content">
          <header className="topbar">
            <div><p className="eyebrow">{today.weekday} · {today.month + 1}月{today.day}日</p><h1>早上好，Amanda!</h1><p className="subtitle">来看看你今天的活动进度吧</p></div>
            <div className="actions"><label className="search"><span>⌕</span><input aria-label="搜索健康数据" placeholder="搜索健康数据" /></label><button>升级计划</button></div>
          </header>

          <div className="grid">
            <article id="overview" className={`card activity${activeSection === "overview" ? " sectionActive" : ""}`}>
              <div className="cardHead"><div><p className="eyebrow">今日概览</p><h2>训练成果</h2></div><span className="roundBadge">◫</span></div>
              <div className="bubbleStage" aria-label={`今日总消耗${totalEnergy ?? "暂无"}千卡，活动消耗${activeEnergy}千卡，运动${exerciseHours}小时`}>
                <div className="bubble yellow"><strong>{totalEnergy?.toLocaleString("zh-CN") ?? "—"}</strong><small>{totalEnergy === null ? "等待静息能量" : "总千卡消耗"}</small></div>
                <div className="bubble coral"><strong>{activeEnergy.toLocaleString("zh-CN")}</strong><small>活动千卡</small></div>
                <div className="bubble dark"><strong>{exerciseHours}</strong><small>小时</small></div>
              </div>
              <div className="legend"><span><i className="dot yellowDot" />总消耗</span><span><i className="dot coralDot" />活动消耗</span><span><i className="dot darkDot" />运动时长</span></div>
            </article>

            <article id="calendar" className={`card calendar${calendarEditing ? " editing" : ""}${activeSection === "calendar" ? " sectionActive" : ""}`}>
              <div className="cardHead">
                <div><p className="eyebrow light">{monthLabel} · {calendarWorkdays} 个工作日</p><h2>工作日历</h2></div>
                <div className="calendarActions">
                  <button type="button" className={`editCalendar${calendarEditing ? " active" : ""}`} onClick={() => setCalendarEditing((value) => !value)}>{calendarEditing ? "完成" : "编辑"}</button>
                  <div className="monthSwitcher" aria-label="切换月份">
                    <button type="button" onClick={() => changeCalendarMonth(-1)} aria-label="上个月">‹</button>
                    <span aria-live="polite">{calendarMonth.month + 1}月</span>
                    <button type="button" onClick={() => changeCalendarMonth(1)} aria-label="下个月">›</button>
                  </div>
                </div>
              </div>
              {calendarEditing && <div className="calendarEditHint"><span>点击日期切换工作或休息</span><div><button type="button" onClick={undoCalendarChange} disabled={!lastCalendarChange || savingDate !== null}>撤销</button><button type="button" className="resetCalendar" onClick={resetOfficialCalendar} disabled={Object.keys(calendarOverrides).length === 0 || resettingCalendar}>{resettingCalendar ? "恢复中…" : "恢复官方"}</button></div></div>}
              <div className="week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
              <div className={`days${calendarRows === 6 ? " sixRows" : ""}`}>
                {calendarDays.map((day, index) => {
                  if (day === null) return <span className="emptyDay" aria-hidden="true" key={`empty-${index}`} />;
                  const key = dateKey(calendarMonth.year, calendarMonth.month, day);
                  const holiday = holidayName(key);
                  const makeup = makeupWorkdays.has(key);
                  const workday = calendarOverrides[key] ?? defaultIsWorkday(calendarMonth.year, calendarMonth.month, day);
                  const isToday = key === todayKey;
                  const className = isToday
                    ? "today"
                    : workday && key < todayKey
                      ? "worked"
                      : workday
                        ? "workday"
                        : "weekend";
                  const statusLabel = holiday
                    ? `${holiday} · ${workday ? "个人设为工作" : "法定休假"}`
                    : makeup
                      ? `调休日 · ${workday ? "上班" : "个人设为休息"}`
                      : workday ? "工作日" : "休息日";
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`${className}${holiday && !workday ? " holiday" : ""}${holiday && workday ? " personalWork" : ""}${makeup && workday ? " makeup" : ""}${makeup && !workday ? " personalRest" : ""}${calendarEditing ? " editable" : ""}`}
                      aria-label={`${calendarMonth.month + 1}月${day}日，${statusLabel}${calendarEditing ? "，点击切换状态" : ""}`}
                      title={`${statusLabel}${calendarEditing ? " · 点击切换" : ""}`}
                      onClick={() => toggleWorkday(day)}
                      disabled={!calendarEditing || savingDate === key}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="calendarLegend"><span>◉ 今天</span><span className="limeText">● 工作日</span><span className="holidayText">● 法定休假</span><span>● 周末</span></div>
            </article>

            <div id="goals" className={`statsColumn${activeSection === "goals" ? " sectionActive" : ""}`}>
              <article className="card steps">
                <div><p className="eyebrow">每日目标</p><h2>今日步数</h2><strong>{steps.toLocaleString("zh-CN")}</strong><span> / {stepGoal.toLocaleString("zh-CN")} 步</span><button className="textButton">调整目标 →</button></div>
                <div className="progressRing" style={{ background: `conic-gradient(var(--coral) 0 ${stepProgress}%, #eceae5 ${stepProgress}%)` }}><div><b>{stepProgress}%</b><small>已完成</small></div></div>
              </article>
              <article className="card weight">
                <div className="cardHead"><div><p className="eyebrow">12 周计划</p><h2>减重目标</h2></div><strong>68%<small> 已完成</small></strong></div>
                <div className="weightTrack"><span /><i>53.2 kg</i></div><div className="weightLabels"><b>58 kg</b><b>50 kg</b></div>
              </article>
            </div>

            <article id="habits" className={`card habits${activeSection === "habits" ? " sectionActive" : ""}`}>
              <div className="cardHead"><div><p className="eyebrow">保持节奏</p><h2>我的习惯</h2></div><button className="addButton">＋ 添加习惯</button></div>
              <div className="habitList">{habits.map(habit => (
                <div className="habit" key={habit.name}>
                  <span className="habitIcon">{habit.icon}</span><div className="habitName"><b>{habit.name}</b><small>{habit.coach}</small></div>
                  <span className="sessions">完成 {habit.done}/{habit.total}</span>
                  <div className="ticks" aria-label={`${habit.done}/${habit.total}次完成`}>{Array.from({ length: habit.total }, (_, i) => <i className={i < habit.done ? "done" : ""} key={i} />)}</div><button className="more" aria-label={`${habit.name}更多选项`}>•••</button>
                </div>
              ))}</div>
            </article>

            <article id="salary" className={`card salary${activeSection === "salary" ? " sectionActive" : ""}`}>
              <div className="salaryIntro">
                <div>
                  <p className="eyebrow">工资助手</p>
                  <h2>本月工资计算</h2>
                  <p className="salarySubtitle">日薪 {money(dailyRate)} 元，固定扣除 {money(deductions)} 元，起征点 {money(taxThreshold)} 元，税率 {taxRate}%</p>
                </div>
                <label className="workdayInput">
                  <span>{monthLabel}工作日</span>
                  <input
                    type="number"
                    readOnly
                    value={workdays}
                  />
                  <b>天</b>
                </label>
              </div>

              <div className="salarySettings">
                <label><span>日薪</span><input type="number" min="0" value={dailyRate} onChange={(event) => setSalarySettings((current) => ({ ...current, dailyRate: Number(event.target.value) }))} /><b>元</b></label>
                <label><span>固定扣除</span><input type="number" min="0" value={deductions} onChange={(event) => setSalarySettings((current) => ({ ...current, deductions: Number(event.target.value) }))} /><b>元</b></label>
                <label><span>起征点</span><input type="number" min="0" value={taxThreshold} onChange={(event) => setSalarySettings((current) => ({ ...current, taxThreshold: Number(event.target.value) }))} /><b>元</b></label>
                <label><span>税率</span><input type="number" min="0" max="100" step="0.1" value={taxRate} onChange={(event) => setSalarySettings((current) => ({ ...current, taxRate: Number(event.target.value) }))} /><b>%</b></label>
                <button type="button" onClick={saveSalarySettings} disabled={settingsStatus === "saving"}>{settingsStatus === "saving" ? "保存中…" : settingsStatus === "saved" ? "参数已保存" : "保存参数"}</button>
              </div>
              {settingsStatus === "error" && <p className="salaryError" role="alert">工资参数保存失败，请稍后再试。</p>}

              <div className="salaryAdjustments">
                <label><span>额外收入</span><input type="number" min="0" value={extraIncome} onChange={(event) => setSalaryAdjustments((current) => ({ ...current, extraIncome: Number(event.target.value) }))} /><b>元</b></label>
                <label><span>奖金</span><input type="number" min="0" value={bonus} onChange={(event) => setSalaryAdjustments((current) => ({ ...current, bonus: Number(event.target.value) }))} /><b>元</b></label>
                <label><span>请假扣款</span><input type="number" min="0" value={leaveDeduction} onChange={(event) => setSalaryAdjustments((current) => ({ ...current, leaveDeduction: Number(event.target.value) }))} /><b>元</b></label>
              </div>

              <div className="salarySummary">
                <div className="netPay">
                  <span>预计实发工资</span>
                  <strong>¥ {money(netSalary)}</strong>
                  <small>应发工资 − 固定扣除 − 个税</small>
                </div>
                <div className="salaryMetrics">
                  <div><span>应发工资</span><b>¥ {money(grossSalary)}</b><small>基本工资 + 额外收入 + 奖金</small></div>
                  <div><span>全部扣除</span><b>− ¥ {money(deductions + leaveDeduction)}</b><small>固定扣除 + 请假扣款</small></div>
                  <div><span>计税收入</span><b>¥ {money(taxableIncome)}</b><small>扣除后再减 ¥{money(taxThreshold)}</small></div>
                  <div><span>个人所得税</span><b>− ¥ {money(incomeTax)}</b><small>计税收入 × {taxRate}%</small></div>
                </div>
              </div>

              <div className="salaryFormula">
                <span>计算公式</span>
                <code>实发 = 工作日 × 日薪 + 额外收入 + 奖金 − 固定扣除 − 请假扣款 − 个税</code>
              </div>
              <div className="salaryHistoryHead">
                <div><p className="eyebrow">月度档案</p><h3>工资历史</h3></div>
                <div className="salaryHistoryActions">
                  <button type="button" className="exportSalary" onClick={exportSalaryRecords} disabled={salaryRecords.length === 0}>导出 CSV</button>
                  <button type="button" className="saveSalary" onClick={saveSalaryRecord} disabled={salaryStatus === "saving"}>
                    {salaryStatus === "saving" ? "保存中…" : salaryStatus === "saved" ? "已保存" : "保存本月"}
                  </button>
                </div>
              </div>
              {salaryStatus === "error" && <p className="salaryError" role="alert">保存失败，请稍后再试。</p>}
              {salaryTrend.length > 0 && (
                <section className="salaryTrend" aria-label="最近六个月工资趋势">
                  <div className="trendLegend">
                    <span><i className="grossKey" />应发</span>
                    <span><i className="deductionKey" />扣除</span>
                    <span><i className="taxKey" />个税</span>
                    <span><i className="netKey" />实发</span>
                  </div>
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
                {salaryRecords.length === 0 ? (
                  <p className="emptySalary">还没有工资记录，点击“保存本月”建立第一条档案。</p>
                ) : salaryRecords.map((record) => (
                  <div className="salaryRecord" key={record.month}>
                    <div><b>{record.month.replace("-", " 年 ")} 月</b><small>{record.workdays} 个工作日 · 加项 ¥{money(record.extraIncome + record.bonus)}</small></div>
                    <span>应发 ¥{money(record.grossSalary)}</span>
                    <span>个税 ¥{money(record.incomeTax)}</span>
                    <strong>实发 ¥{money(record.netSalary)}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
