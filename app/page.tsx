"use client";

import { useEffect, useState } from "react";

type HealthDaily = {
  date: string;
  steps: number;
  activeEnergyKcal: number;
  restingEnergyKcal: number;
  exerciseMinutes: number;
  workoutCount: number;
  source: string;
  updatedAt: string;
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

type WorkExperience = {
  id: number;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  summary: string;
};

type WorkExperienceDraft = Omit<WorkExperience, "id">;

type CalendarNote = {
  month: string;
  scheduleNote: string;
  leaveNote: string;
  overtimeNote: string;
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

const genshinQuotes = [
  { text: "旅程总有一天会迎来终点，不必匆忙。", source: "钟离" },
  { text: "我们终将重逢。", source: "旅行者" },
  { text: "向着星辰与深渊！", source: "凯瑟琳" },
  { text: "在黎明到来之前，必须有人稍微照亮黑暗。", source: "迪卢克" },
  { text: "风带来了故事的种子，时间使之发芽。", source: "蒙德古语" },
] as const;

export default function Home() {
  const [sitePage, setSitePage] = useState<"home" | "dashboard">("home");
  const [activeSection, setActiveSection] = useState("overview");
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDaily[]>([]);
  const [healthLoadStatus, setHealthLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [healthPeriod, setHealthPeriod] = useState<7 | 30>(7);
  const [healthMetric, setHealthMetric] = useState<"steps" | "activeEnergyKcal" | "exerciseMinutes">("steps");
  const [showHealthTrend, setShowHealthTrend] = useState(false);
  const [calendarEditing, setCalendarEditing] = useState(false);
  const [showAnnualStats, setShowAnnualStats] = useState(false);
  const [showCalendarNotes, setShowCalendarNotes] = useState(false);
  const [annualOverrides, setAnnualOverrides] = useState<Record<string, boolean>>({});
  const [calendarNote, setCalendarNote] = useState<CalendarNote>({ month: "", scheduleNote: "", leaveNote: "", overtimeNote: "" });
  const [calendarNoteStatus, setCalendarNoteStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, boolean>>({});
  const [calendarLoadStatus, setCalendarLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [calendarReloadKey, setCalendarReloadKey] = useState(0);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [lastCalendarChange, setLastCalendarChange] = useState<{ date: string; previous: boolean; hadOverride: boolean } | null>(null);
  const [resettingCalendar, setResettingCalendar] = useState(false);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [salaryLoadStatus, setSalaryLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [salaryStatus, setSalaryStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [salarySettings, setSalarySettings] = useState<SalarySettings>({ dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 3 });
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [salaryAdjustments, setSalaryAdjustments] = useState<SalaryAdjustments>({ extraIncome: 0, bonus: 0, leaveDeduction: 0 });
  const [workExperiences, setWorkExperiences] = useState<WorkExperience[]>([]);
  const [experienceEditingId, setExperienceEditingId] = useState<number | null>(null);
  const [experienceFormOpen, setExperienceFormOpen] = useState(false);
  const [experienceStatus, setExperienceStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const [experienceDraft, setExperienceDraft] = useState<WorkExperienceDraft>({ company: "", role: "", startDate: "", endDate: null, summary: "" });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = getShanghaiDate();
    return { year: now.year, month: now.month };
  });
  const today = getShanghaiDate();
  const quoteDay = Math.floor(Date.UTC(today.year, today.month, today.day) / 86_400_000);
  const dailyQuote = genshinQuotes[quoteDay % genshinQuotes.length];
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
  const annualWorkdays = Array.from({ length: 12 }, (_, month) => {
    const count = new Date(calendarMonth.year, month + 1, 0).getDate();
    return Array.from({ length: count }, (_, index) => index + 1).filter((day) => {
      const key = dateKey(calendarMonth.year, month, day);
      return annualOverrides[key] ?? defaultIsWorkday(calendarMonth.year, month, day);
    }).length;
  });
  const annualWorkdayTotal = annualWorkdays.reduce((sum, count) => sum + count, 0);
  const monthLabel = `${calendarMonth.year}年${calendarMonth.month + 1}月`;
  const calendarMonthKey = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
  const workdays = calendarWorkdays;
  const stepGoal = 8500;
  const steps = health?.steps ?? 0;
  const stepProgress = Math.min(100, Math.round((steps / stepGoal) * 100));
  const activeEnergy = Math.round(health?.activeEnergyKcal ?? 0);
  const totalEnergy = health && health.restingEnergyKcal > 0
    ? Math.round(health.activeEnergyKcal + health.restingEnergyKcal)
    : null;
  const exerciseHours = ((health?.exerciseMinutes ?? 0) / 60).toFixed(1);
  const visibleHealthHistory = healthHistory.slice(-healthPeriod);
  const healthMetricConfig = {
    steps: { label: "步数", unit: "步", color: "var(--lime)" },
    activeEnergyKcal: { label: "活动能量", unit: "千卡", color: "var(--coral)" },
    exerciseMinutes: { label: "锻炼时长", unit: "分钟", color: "#54d6ff" },
  }[healthMetric];
  const healthMetricMax = Math.max(1, ...visibleHealthHistory.map((item) => item[healthMetric]));
  const healthMetricAverage = visibleHealthHistory.length
    ? Math.round(visibleHealthHistory.reduce((sum, item) => sum + item[healthMetric], 0) / visibleHealthHistory.length)
    : 0;

  const loadHealthData = () => {
    setHealthLoadStatus("loading");
    fetch("/api/health?days=30", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health data unavailable");
        return response.json() as Promise<{ health: HealthDaily | null; history: HealthDaily[] }>;
      })
      .then(({ health: latest, history }) => {
        setHealth(latest);
        setHealthHistory([...history].reverse());
        setHealthLoadStatus("ready");
      })
      .catch(() => {
        setHealth(null);
        setHealthHistory([]);
        setHealthLoadStatus("error");
      });
  };
  useEffect(() => {
    loadHealthData();
  }, []);

  useEffect(() => {
    setCalendarLoadStatus("loading");
    fetch(`/api/calendar?month=${calendarMonthKey}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Calendar data unavailable");
        return response.json() as Promise<{ overrides: Array<{ date: string; isWorkday: boolean }> }>;
      })
      .then(({ overrides }) => {
        setCalendarOverrides(Object.fromEntries(overrides.map((item) => [item.date, item.isWorkday])));
        setCalendarLoadStatus("ready");
      })
      .catch(() => setCalendarLoadStatus("error"));
  }, [calendarMonthKey, calendarReloadKey]);
  useEffect(() => {
    setCalendarNoteStatus("loading");
    fetch(`/api/calendar-notes?month=${calendarMonthKey}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Calendar notes unavailable");
        return response.json() as Promise<{ note: CalendarNote }>;
      })
      .then(({ note }) => {
        setCalendarNote(note);
        setCalendarNoteStatus("idle");
      })
      .catch(() => {
        setCalendarNote({ month: calendarMonthKey, scheduleNote: "", leaveNote: "", overtimeNote: "" });
        setCalendarNoteStatus("error");
      });
  }, [calendarMonthKey]);
  useEffect(() => {
    if (!showAnnualStats) return;
    fetch(`/api/calendar?year=${calendarMonth.year}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Annual calendar unavailable");
        return response.json() as Promise<{ overrides: Array<{ date: string; isWorkday: boolean }> }>;
      })
      .then(({ overrides }) => setAnnualOverrides(Object.fromEntries(overrides.map((item) => [item.date, item.isWorkday]))))
      .catch(() => setAnnualOverrides({}));
  }, [calendarMonth.year, showAnnualStats, calendarOverrides]);

  const loadSalaryData = () => {
    setSalaryLoadStatus("loading");
    fetch("/api/salary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Salary history unavailable");
        return response.json() as Promise<{ records: SalaryRecord[]; settings: SalarySettings }>;
      })
      .then(({ records, settings }) => {
        setSalaryRecords(records);
        setSalarySettings(settings);
        setSalaryLoadStatus("ready");
      })
      .catch(() => setSalaryLoadStatus("error"));
  };
  useEffect(() => {
    loadSalaryData();
  }, []);
  const loadWorkExperiences = () => {
    setExperienceStatus("loading");
    fetch("/api/work-experiences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Work experiences unavailable");
        return response.json() as Promise<{ experiences: WorkExperience[] }>;
      })
      .then(({ experiences }) => {
        setWorkExperiences(experiences);
        setExperienceStatus("idle");
      })
      .catch(() => setExperienceStatus("error"));
  };
  useEffect(() => {
    loadWorkExperiences();
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

  const openDashboard = (section = "overview") => {
    setSitePage("dashboard");
    setActiveSection(section);
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
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

  const saveCalendarNote = async (event: React.FormEvent) => {
    event.preventDefault();
    setCalendarNoteStatus("saving");
    try {
      const response = await fetch("/api/calendar-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...calendarNote, month: calendarMonthKey }),
      });
      if (!response.ok) throw new Error("Calendar note save failed");
      const { note } = await response.json() as { note: CalendarNote };
      setCalendarNote(note);
      setCalendarNoteStatus("saved");
    } catch {
      setCalendarNoteStatus("error");
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

  const openExperienceForm = (experience?: WorkExperience) => {
    setExperienceEditingId(experience?.id ?? null);
    setExperienceDraft(experience
      ? { company: experience.company, role: experience.role, startDate: experience.startDate, endDate: experience.endDate, summary: experience.summary }
      : { company: "", role: "", startDate: "", endDate: null, summary: "" });
    setExperienceStatus("idle");
    setExperienceFormOpen(true);
  };

  const saveWorkExperience = async (event: React.FormEvent) => {
    event.preventDefault();
    setExperienceStatus("saving");
    try {
      const response = await fetch("/api/work-experiences", {
        method: experienceEditingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...experienceDraft, id: experienceEditingId }),
      });
      if (!response.ok) throw new Error("Save failed");
      const { experience } = await response.json() as { experience: WorkExperience };
      setWorkExperiences((items) => experienceEditingId
        ? items.map((item) => item.id === experience.id ? experience : item)
        : [...items, experience]);
      setExperienceFormOpen(false);
      setExperienceEditingId(null);
      setExperienceStatus("idle");
    } catch {
      setExperienceStatus("error");
    }
  };

  const deleteWorkExperience = async (experience: WorkExperience) => {
    if (!window.confirm(`确定删除“${experience.company} · ${experience.role}”吗？`)) return;
    try {
      const response = await fetch("/api/work-experiences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: experience.id }),
      });
      if (!response.ok) throw new Error("Delete failed");
      setWorkExperiences((items) => items.filter((item) => item.id !== experience.id));
    } catch {
      setExperienceStatus("error");
    }
  };

  return (
    <main className="pageShell">
      <section className="dashboard">
        <header className="siteNavigation">
          <button className="siteBrand" type="button" onClick={() => setSitePage("home")} aria-label="璀璨人生首页"><span className="brandMark" aria-hidden="true" /><b>璀璨人生</b></button>
          <nav aria-label="网站导航">
            <button type="button" className={sitePage === "home" ? "active" : ""} onClick={() => setSitePage("home")}>首页</button>
            <button type="button" className={sitePage === "dashboard" ? "active" : ""} onClick={() => setSitePage("dashboard")}>数据中心</button>
          </nav>
          <div className="siteProfile"><span className="avatar">AM</span><div><b>Amanda</b><small>生活记录者</small></div></div>
        </header>
        {sitePage === "home" ? (
          <section className="homePage">
            <div className="homeHero">
              <div>
                <p className="eyebrow">{today.weekday} · {today.month + 1}月{today.day}日</p>
                <h1 className="dailyQuote">“{dailyQuote.text}”</h1>
                <p className="quoteSource">— {dailyQuote.source} · 《原神》每日一言</p>
                <p>把健康、工作、收入与职业经历放在同一个地方，清楚看见生活正在如何向前。</p>
                <button type="button" onClick={() => openDashboard()}>进入数据中心 <span>→</span></button>
              </div>
              <div className="homeSnapshot" aria-label="今日生活概览">
                <div className="snapshotHead"><div><i /><span>今日状态</span></div><small>{today.month + 1}月{today.day}日</small></div>
                <div className="snapshotPrimary"><span>今日步数</span><strong>{healthLoadStatus === "loading" ? "读取中" : healthLoadStatus === "error" ? "—" : steps.toLocaleString("zh-CN")}</strong><small>{healthLoadStatus === "error" ? "健康数据暂时无法读取" : `目标 ${stepGoal.toLocaleString("zh-CN")} 步`}</small><div><i style={{ width: `${stepProgress}%` }} /></div></div>
                <div className="snapshotMetrics">
                  <div><span>活动能量</span><b>{activeEnergy.toLocaleString("zh-CN")}</b><small>千卡</small></div>
                  <div><span>本月工作</span><b>{workdays}</b><small>天</small></div>
                </div>
                <button type="button" onClick={() => openDashboard("overview")}><span>查看完整数据</span><b>↗</b></button>
              </div>
            </div>
            <div className="homeHighlights">
              <button type="button" onClick={() => openDashboard("overview")}><i className="healthHighlight" /><span>健康趋势</span><strong>{healthHistory.length} 天</strong><small>Apple 健康记录</small></button>
              <button type="button" onClick={() => openDashboard("calendar")}><i className="calendarHighlight" /><span>本月工作</span><strong>{workdays} 天</strong><small>日历实时统计</small></button>
              <button type="button" onClick={() => openDashboard("salary")}><i className="salaryHighlight" /><span>预计实发</span><strong>¥{money(netSalary)}</strong><small>按当前工作日计算</small></button>
              <button type="button" onClick={() => openDashboard("habits")}><i className="careerHighlight" /><span>职业档案</span><strong>{workExperiences.length} 条</strong><small>已保存工作经历</small></button>
            </div>
          </section>
        ) : (
        <div className="content">
          <header className="topbar">
            <div><p className="eyebrow">{today.weekday} · {today.month + 1}月{today.day}日</p><h1>早上好，Amanda!</h1><p className="subtitle">来看看你今天的活动进度吧</p></div>
            <div className="actions"><label className="search"><span>⌕</span><input aria-label="搜索健康数据" placeholder="搜索健康数据" /></label><button>升级计划</button></div>
          </header>

          <nav className="dataQuickNav" aria-label="数据中心模块快捷导航">
            {[
              ["overview", "健康"],
              ["calendar", "工作日历"],
              ["goals", "每日目标"],
              ["habits", "工作经历"],
              ["salary", "工资"],
            ].map(([section, label]) => (
              <button
                type="button"
                key={section}
                className={activeSection === section ? "active" : ""}
                aria-current={activeSection === section ? "location" : undefined}
                onClick={() => openDashboard(section)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="grid">
            <article id="overview" className={`card activity${activeSection === "overview" ? " sectionActive" : ""}`}>
              <div className="cardHead"><div><p className="eyebrow">今日概览</p><h2>{showHealthTrend ? "健康趋势" : "训练成果"}</h2></div><button type="button" className={`healthTrendToggle${showHealthTrend ? " active" : ""}`} onClick={() => setShowHealthTrend((value) => !value)}>{showHealthTrend ? "今日" : "趋势"}</button></div>
              {showHealthTrend ? (
                <div className="healthTrend">
                  <div className="healthTrendControls">
                    <div className="healthMetricTabs">
                      <button type="button" className={healthMetric === "steps" ? "active" : ""} onClick={() => setHealthMetric("steps")}>步数</button>
                      <button type="button" className={healthMetric === "activeEnergyKcal" ? "active" : ""} onClick={() => setHealthMetric("activeEnergyKcal")}>能量</button>
                      <button type="button" className={healthMetric === "exerciseMinutes" ? "active" : ""} onClick={() => setHealthMetric("exerciseMinutes")}>锻炼</button>
                    </div>
                    <div className="healthPeriodTabs"><button type="button" className={healthPeriod === 7 ? "active" : ""} onClick={() => setHealthPeriod(7)}>7天</button><button type="button" className={healthPeriod === 30 ? "active" : ""} onClick={() => setHealthPeriod(30)}>30天</button></div>
                  </div>
                  <div className="healthTrendSummary"><span>日均</span><strong>{healthMetricAverage.toLocaleString("zh-CN")}</strong><small>{healthMetricConfig.unit}</small>{health && <span className="healthSyncStatus">最近同步 {health.date} · {health.source === "health-auto-export" ? "Apple 健康" : health.source}</span>}</div>
                  {visibleHealthHistory.length ? (
                    <div className={`healthBars${healthPeriod === 30 ? " compact" : ""}`} aria-label={`最近${healthPeriod}天${healthMetricConfig.label}趋势`}>
                      {visibleHealthHistory.map((item) => (
                        <div className="healthBarDay" key={item.date} title={`${item.date}：${Math.round(item[healthMetric]).toLocaleString("zh-CN")} ${healthMetricConfig.unit}`}>
                          <i style={{ height: `${Math.max(4, Math.round(item[healthMetric] / healthMetricMax * 100))}%`, background: healthMetricConfig.color }} />
                          {(healthPeriod === 7 || item.date.endsWith("-01") || item.date.endsWith("-10") || item.date.endsWith("-20")) && <small>{Number(item.date.slice(-2))}</small>}
                        </div>
                      ))}
                    </div>
                  ) : <div className="healthTrendEmpty"><p>{healthLoadStatus === "loading" ? "正在读取健康数据…" : healthLoadStatus === "error" ? "健康数据读取失败" : "还没有可用于绘制趋势的健康数据"}</p>{healthLoadStatus === "error" && <button type="button" onClick={loadHealthData}>重新加载</button>}</div>}
                </div>
              ) : <>
              <div className="bubbleStage" aria-label={`今日总消耗${totalEnergy ?? "暂无"}千卡，活动消耗${activeEnergy}千卡，运动${exerciseHours}小时`}>
                <div className="bubble yellow"><strong>{totalEnergy?.toLocaleString("zh-CN") ?? "—"}</strong><small>{totalEnergy === null ? "等待静息能量" : "总千卡消耗"}</small></div>
                <div className="bubble coral"><strong>{activeEnergy.toLocaleString("zh-CN")}</strong><small>活动千卡</small></div>
                <div className="bubble dark"><strong>{exerciseHours}</strong><small>小时</small></div>
              </div>
              <div className="legend"><span><i className="dot yellowDot" />总消耗</span><span><i className="dot coralDot" />活动消耗</span><span><i className="dot darkDot" />运动时长</span></div>
              </>}
            </article>

            <article id="calendar" className={`card calendar${calendarEditing ? " editing" : ""}${activeSection === "calendar" ? " sectionActive" : ""}`}>
              <div className="cardHead">
                <div><p className="eyebrow light">{monthLabel} · {calendarWorkdays} 个工作日</p><h2>工作日历</h2></div>
                <div className="calendarActions">
                  <button type="button" className={`annualCalendarButton${showAnnualStats ? " active" : ""}`} onClick={() => { setShowAnnualStats((value) => !value); setShowCalendarNotes(false); setCalendarEditing(false); }}>{showAnnualStats ? "月历" : "全年"}</button>
                  <button type="button" className={`calendarNotesButton${showCalendarNotes ? " active" : ""}`} onClick={() => { setShowCalendarNotes((value) => !value); setShowAnnualStats(false); setCalendarEditing(false); }}>{showCalendarNotes ? "月历" : "备注"}</button>
                  <button type="button" className={`editCalendar${calendarEditing ? " active" : ""}`} onClick={() => { setCalendarEditing((value) => !value); setShowAnnualStats(false); setShowCalendarNotes(false); }}>{calendarEditing ? "完成" : "编辑"}</button>
                  <div className="monthSwitcher" aria-label="切换月份">
                    <button type="button" onClick={() => changeCalendarMonth(-1)} aria-label="上个月">‹</button>
                    <span aria-live="polite">{calendarMonth.month + 1}月</span>
                    <button type="button" onClick={() => changeCalendarMonth(1)} aria-label="下个月">›</button>
                  </div>
                </div>
              </div>
              {calendarLoadStatus === "loading" ? (
                <div className="moduleState darkState"><span className="statePulse" /><p>正在读取工作日历…</p></div>
              ) : calendarLoadStatus === "error" ? (
                <div className="moduleState darkState" role="alert"><p>工作日历读取失败，当前数据未被覆盖。</p><button type="button" onClick={() => setCalendarReloadKey((value) => value + 1)}>重新加载</button></div>
              ) : showAnnualStats ? (
                <div className="annualCalendar">
                  <div className="annualTotal"><strong>{annualWorkdayTotal}</strong><span>个工作日</span><small>{calendarMonth.year} 年度统计</small></div>
                  <div className="annualMonths">{annualWorkdays.map((count, month) => (
                    <button type="button" key={month} onClick={() => { setCalendarMonth({ year: calendarMonth.year, month }); setShowAnnualStats(false); }}>
                      <span>{month + 1}月</span><strong>{count}</strong><small>天</small>
                    </button>
                  ))}</div>
                </div>
              ) : showCalendarNotes ? (
                <form className="calendarNotesForm" onSubmit={saveCalendarNote}>
                  <p>{monthLabel}工作备注会自动保存在云端</p>
                  <label><span><i className="scheduleNoteMark" />排班</span><textarea maxLength={500} rows={2} placeholder="例如：本月夜班、外出或临时排班" value={calendarNote.scheduleNote} onChange={(event) => setCalendarNote((note) => ({ ...note, scheduleNote: event.target.value }))} /></label>
                  <label><span><i className="leaveNoteMark" />请假</span><textarea maxLength={500} rows={2} placeholder="例如：8月12日下午请假" value={calendarNote.leaveNote} onChange={(event) => setCalendarNote((note) => ({ ...note, leaveNote: event.target.value }))} /></label>
                  <label><span><i className="overtimeNoteMark" />加班</span><textarea maxLength={500} rows={2} placeholder="例如：8月19日加班3小时" value={calendarNote.overtimeNote} onChange={(event) => setCalendarNote((note) => ({ ...note, overtimeNote: event.target.value }))} /></label>
                  <div className="calendarNotesFooter"><span className={calendarNoteStatus === "error" ? "noteError" : ""}>{calendarNoteStatus === "loading" ? "读取中…" : calendarNoteStatus === "saved" ? "已保存" : calendarNoteStatus === "error" ? "保存失败，请重试" : ""}</span><button type="submit" disabled={calendarNoteStatus === "saving" || calendarNoteStatus === "loading"}>{calendarNoteStatus === "saving" ? "保存中…" : "保存备注"}</button></div>
                </form>
              ) : <>
              {calendarEditing && <div className="calendarEditHint"><span>点击日期切换工作或休息</span><div><button type="button" onClick={undoCalendarChange} disabled={!lastCalendarChange || savingDate !== null}>撤销</button><button type="button" className="resetCalendar" onClick={resetOfficialCalendar} disabled={Object.keys(calendarOverrides).length === 0 || resettingCalendar}>{resettingCalendar ? "恢复中…" : "恢复官方"}</button></div></div>}
              <div className="week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
              <div className={`days${calendarRows === 6 ? " sixRows" : ""}`}>
                {calendarDays.map((day, index) => {
                  if (day === null) return <span className="emptyDay" aria-hidden="true" key={`empty-${index}`} />;
                  const key = dateKey(calendarMonth.year, calendarMonth.month, day);
                  const holiday = holidayName(key);
                  const makeup = makeupWorkdays.has(key);
                  const workday = calendarOverrides[key] ?? defaultIsWorkday(calendarMonth.year, calendarMonth.month, day);
                  const personalOverride = Object.prototype.hasOwnProperty.call(calendarOverrides, key);
                  const isToday = key === todayKey;
                  const className = isToday
                    ? "today"
                    : workday && key < todayKey
                      ? "worked"
                      : workday
                        ? "workday"
                        : "weekend";
                  const statusLabel = personalOverride
                    ? `个人设为${workday ? "工作" : "休息"}`
                    : holiday
                    ? `${holiday} · 法定休假`
                    : makeup
                      ? "调休上班"
                      : workday ? "工作日" : "休息日";
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`${className}${holiday ? " holiday" : ""}${makeup ? " makeup" : ""}${personalOverride ? (workday ? " personalWork" : " personalRest") : ""}${calendarEditing ? " editable" : ""}`}
                      aria-label={`${calendarMonth.month + 1}月${day}日，${statusLabel}${calendarEditing ? "，点击切换状态" : ""}`}
                      title={`${statusLabel}${calendarEditing ? " · 点击切换" : ""}`}
                      onClick={() => toggleWorkday(day)}
                      disabled={!calendarEditing || savingDate === key}
                    >
                      <span className="dayNumber">{day}</span>
                      {holiday && <small className="holidayName">{holiday}</small>}
                    </button>
                  );
                })}
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
              <div className="cardHead"><div><p className="eyebrow">职业档案</p><h2>工作经历</h2></div><button type="button" className="addButton" onClick={() => openExperienceForm()}>＋ 添加经历</button></div>
              {experienceFormOpen ? (
                <form className="experienceForm" onSubmit={saveWorkExperience}>
                  <div className="experienceFields">
                    <label><span>单位</span><input required maxLength={80} value={experienceDraft.company} onChange={(event) => setExperienceDraft((draft) => ({ ...draft, company: event.target.value }))} /></label>
                    <label><span>职位</span><input required maxLength={80} value={experienceDraft.role} onChange={(event) => setExperienceDraft((draft) => ({ ...draft, role: event.target.value }))} /></label>
                    <label><span>开始</span><input required type="month" value={experienceDraft.startDate} onChange={(event) => setExperienceDraft((draft) => ({ ...draft, startDate: event.target.value }))} /></label>
                    <label><span>结束</span><input type="month" value={experienceDraft.endDate ?? ""} onChange={(event) => setExperienceDraft((draft) => ({ ...draft, endDate: event.target.value || null }))} /></label>
                  </div>
                  <label className="experienceSummary"><span>工作内容</span><textarea maxLength={300} rows={2} value={experienceDraft.summary} onChange={(event) => setExperienceDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label>
                  {experienceStatus === "error" && <p className="experienceError" role="alert">保存失败，请稍后重试。</p>}
                  <div className="experienceFormActions"><button type="button" onClick={() => setExperienceFormOpen(false)}>取消</button><button type="submit" disabled={experienceStatus === "saving"}>{experienceStatus === "saving" ? "保存中…" : experienceEditingId ? "保存修改" : "添加经历"}</button></div>
                </form>
              ) : (
                <div className="experienceList">
                  {experienceStatus === "loading" && <p className="experienceEmpty">正在读取工作经历…</p>}
                  {experienceStatus === "error" && <div className="moduleState" role="alert"><p>工作经历读取失败。</p><button type="button" onClick={loadWorkExperiences}>重新加载</button></div>}
                  {experienceStatus === "idle" && workExperiences.length === 0 && <button type="button" className="experienceEmpty addExperienceEmpty" onClick={() => openExperienceForm()}>还没有工作经历，点击添加第一条</button>}
                  {workExperiences.map((experience) => (
                    <div className="experienceItem" key={experience.id}>
                      <span className="experienceMark" aria-hidden="true" />
                      <div className="experienceContent"><b>{experience.role}</b><strong>{experience.company}</strong><small>{experience.startDate} — {experience.endDate ?? "至今"}</small>{experience.summary && <p>{experience.summary}</p>}</div>
                      <div className="experienceActions"><button type="button" onClick={() => openExperienceForm(experience)}>编辑</button><button type="button" className="deleteExperience" onClick={() => deleteWorkExperience(experience)}>删除</button></div>
                    </div>
                  ))}
                </div>
              )}
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
                {salaryLoadStatus === "loading" ? (
                  <div className="moduleState"><span className="statePulse" /><p>正在读取工资记录…</p></div>
                ) : salaryLoadStatus === "error" ? (
                  <div className="moduleState" role="alert"><p>工资记录读取失败，计算参数未被覆盖。</p><button type="button" onClick={loadSalaryData}>重新加载</button></div>
                ) : salaryRecords.length === 0 ? (
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
        )}
      </section>
    </main>
  );
}
