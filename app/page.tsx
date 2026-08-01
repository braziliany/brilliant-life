"use client";

import { useEffect, useState } from "react";
import { HomePage } from "./components/home/HomePage";
import { DashboardHeader } from "./components/shell/DashboardHeader";
import { DataQuickNav } from "./components/shell/DataQuickNav";
import { SiteNavigation } from "./components/shell/SiteNavigation";
import { HealthOverviewCard } from "./features/health/HealthOverviewCard";
import { DailyGoalsColumn } from "./features/health/DailyGoalsColumn";
import { WorkCalendarCard } from "./features/calendar/WorkCalendarCard";
import { WorkExperienceTimeline } from "./features/career/WorkExperienceTimeline";
import { SalaryDashboard } from "./features/salary/SalaryDashboard";
import type { CalendarDayView, CalendarNote, HealthDaily, HealthMetric, SalaryPolicy, SalaryRecord, SitePage, WorkExperience, WorkExperienceDraft } from "./page-view.types";

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

const formatShanghaiDateTime = (value?: string) => {
  if (!value) return "尚无记录";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
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

const experienceDuration = (startDate: string, endDate: string | null) => {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const current = getShanghaiDate();
  const effectiveEnd = endDate ?? `${current.year}-${String(current.month + 1).padStart(2, "0")}`;
  const [endYear, endMonth] = effectiveEnd.split("-").map(Number);
  const months = Math.max(0, (endYear - startYear) * 12 + endMonth - startMonth + 1);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return [years ? `${years} 年` : "", remainingMonths ? `${remainingMonths} 个月` : ""].filter(Boolean).join(" ") || "不足 1 个月";
};

export default function Home() {
  const [sitePage, setSitePage] = useState<SitePage>("home");
  const [activeSection, setActiveSection] = useState("overview");
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDaily[]>([]);
  const [healthLoadStatus, setHealthLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [healthPeriod, setHealthPeriod] = useState<7 | 30>(7);
  const [healthMetric, setHealthMetric] = useState<HealthMetric>("steps");
  const [showHealthTrend, setShowHealthTrend] = useState(false);
  const [showHealthGuide, setShowHealthGuide] = useState(false);
  const [stepGoal, setStepGoal] = useState(8500);
  const [stepGoalDraft, setStepGoalDraft] = useState("8500");
  const [editingStepGoal, setEditingStepGoal] = useState(false);
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
  const [salaryPolicy, setSalaryPolicy] = useState<SalaryPolicy>({ dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 3, extraIncome: 0, bonus: 0, leaveDeduction: 0 });
  const [workExperiences, setWorkExperiences] = useState<WorkExperience[]>([]);
  const [experienceEditingId, setExperienceEditingId] = useState<number | null>(null);
  const [experienceFormOpen, setExperienceFormOpen] = useState(false);
  const [experienceStatus, setExperienceStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const [experienceDraft, setExperienceDraft] = useState<WorkExperienceDraft>({ company: "", role: "", startDate: "", endDate: null, summary: "" });
  const [expandedExperienceId, setExpandedExperienceId] = useState<number | null>(null);
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
  const calendarDayViews: CalendarDayView[] = calendarDays.map((day, index) => {
    if (day === null) return { key: `empty-${index}`, day: null };
    const key = dateKey(calendarMonth.year, calendarMonth.month, day);
    const holiday = holidayName(key);
    const makeup = makeupWorkdays.has(key);
    const workday = calendarOverrides[key] ?? defaultIsWorkday(calendarMonth.year, calendarMonth.month, day);
    const personalOverride = Object.prototype.hasOwnProperty.call(calendarOverrides, key);
    const isToday = key === todayKey;
    const className = isToday ? "today" : workday && key < todayKey ? "worked" : workday ? "workday" : "weekend";
    const statusLabel = personalOverride
      ? `个人设为${workday ? "工作" : "休息"}`
      : holiday
        ? `${holiday} · 法定休假`
        : makeup
          ? "调休上班"
          : workday ? "工作日" : "休息日";
    return {
      key,
      day,
      holiday,
      className: `${className}${holiday ? " holiday" : ""}${makeup ? " makeup" : ""}${personalOverride ? (workday ? " personalWork" : " personalRest") : ""}${calendarEditing ? " editable" : ""}`,
      ariaLabel: `${calendarMonth.month + 1}月${day}日，${statusLabel}${calendarEditing ? "，点击切换状态" : ""}`,
      title: `${statusLabel}${calendarEditing ? " · 点击切换" : ""}`,
      disabled: !calendarEditing || savingDate === key,
    };
  });
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
  const currentMonthKey = `${today.year}-${String(today.month + 1).padStart(2, "0")}`;
  const isCurrentCalendarMonth = calendarMonthKey === currentMonthKey;
  const workdays = calendarWorkdays;
  const steps = health?.steps ?? 0;
  const stepProgress = Math.min(100, Math.round((steps / stepGoal) * 100));
  const activeEnergy = Math.round(health?.activeEnergyKcal ?? 0);
  const totalEnergy = health && health.restingEnergyKcal > 0
    ? Math.round(health.activeEnergyKcal + health.restingEnergyKcal)
    : null;
  const exerciseHours = ((health?.exerciseMinutes ?? 0) / 60).toFixed(1);
  const visibleHealthHistory = healthHistory.slice(-healthPeriod);
  const weightHistory = healthHistory.filter((item) => item.weightKg !== null);
  const recentWeightHistory = weightHistory.slice(-14);
  const latestWeight = weightHistory.at(-1)?.weightKg ?? null;
  const earliestRecentWeight = recentWeightHistory[0]?.weightKg ?? null;
  const weightChange = latestWeight !== null && earliestRecentWeight !== null && recentWeightHistory.length > 1
    ? latestWeight - earliestRecentWeight
    : null;
  const healthMetricConfig = {
    steps: { label: "步数", unit: "步", color: "var(--lime)" },
    activeEnergyKcal: { label: "活动能量", unit: "千卡", color: "var(--coral)" },
    exerciseMinutes: { label: "锻炼时长", unit: "分钟", color: "#54d6ff" },
    weightKg: { label: "体重", unit: "kg", color: "#c28cff" },
    sleepMinutes: { label: "睡眠时长", unit: "小时", color: "#768cff" },
    restingHeartRateBpm: { label: "静息心率", unit: "次/分", color: "#ff7aa2" },
  }[healthMetric];
  const healthMetricHistory = healthMetric === "weightKg" || healthMetric === "sleepMinutes" || healthMetric === "restingHeartRateBpm"
    ? visibleHealthHistory.filter((item) => item[healthMetric] !== null)
    : visibleHealthHistory;
  const healthMetricValue = (item: HealthDaily) => {
    if (healthMetric === "weightKg") return item.weightKg ?? 0;
    if (healthMetric === "sleepMinutes") return (item.sleepMinutes ?? 0) / 60;
    if (healthMetric === "restingHeartRateBpm") return item.restingHeartRateBpm ?? 0;
    return item[healthMetric];
  };
  const healthMetricMax = Math.max(1, ...healthMetricHistory.map(healthMetricValue));
  const healthMetricAverage = healthMetricHistory.length
    ? healthMetricHistory.reduce((sum, item) => sum + healthMetricValue(item), 0) / healthMetricHistory.length
    : 0;
  const healthMetricAverageLabel = healthMetric === "weightKg" || healthMetric === "sleepMinutes"
    ? healthMetricAverage.toFixed(1)
    : Math.round(healthMetricAverage).toLocaleString("zh-CN");
  const recentWeightValues = recentWeightHistory.map((item) => item.weightKg ?? 0);
  const recentWeightMin = Math.min(...recentWeightValues, latestWeight ?? 0);
  const recentWeightMax = Math.max(...recentWeightValues, latestWeight ?? 1);
  const recentWeightRange = Math.max(0.1, recentWeightMax - recentWeightMin);
  const latestSyncedHealth = healthHistory.at(-1) ?? null;
  const missingTodayMetrics = health
    ? [
        health.weightKg === null ? "体重" : null,
        health.sleepMinutes === null ? "睡眠" : null,
        health.restingHeartRateBpm === null ? "静息心率" : null,
      ].filter((label): label is string => label !== null)
    : [];
  const healthFreshness = healthLoadStatus === "loading"
    ? "正在检查"
    : healthLoadStatus === "error"
      ? "读取失败"
      : health
        ? "今天已同步"
        : "今天尚未上传";

  const loadHealthData = () => {
    setHealthLoadStatus("loading");
    fetch("/api/health?days=30", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health data unavailable");
        return response.json() as Promise<{ health: HealthDaily | null; history: HealthDaily[] }>;
      })
      .then(({ history }) => {
        setHealth(history.find((item) => item.date === todayKey) ?? null);
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
    const savedGoal = Number(window.localStorage.getItem("brilliant-life-step-goal"));
    if (Number.isInteger(savedGoal) && savedGoal >= 1000 && savedGoal <= 100000) {
      setStepGoal(savedGoal);
      setStepGoalDraft(String(savedGoal));
    }
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadHealthData();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [todayKey]);

  const saveStepGoal = (event: React.FormEvent) => {
    event.preventDefault();
    const nextGoal = Number(stepGoalDraft);
    if (!Number.isInteger(nextGoal) || nextGoal < 1000 || nextGoal > 100000) return;
    setStepGoal(nextGoal);
    window.localStorage.setItem("brilliant-life-step-goal", String(nextGoal));
    setEditingStepGoal(false);
  };

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
        return response.json() as Promise<{ records: SalaryRecord[]; policy: SalaryPolicy }>;
      })
      .then(({ records, policy }) => {
        setSalaryRecords(records);
        setSalaryPolicy(policy);
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
  const { dailyRate, deductions, taxThreshold, taxRate, extraIncome, bonus, leaveDeduction } = salaryPolicy;
  const grossSalary = workdays * dailyRate + extraIncome + bonus;
  const taxableIncome = Math.max(0, grossSalary - deductions - leaveDeduction - taxThreshold);
  const incomeTax = taxableIncome * taxRate / 100;
  const netSalary = grossSalary - deductions - leaveDeduction - incomeTax;
  const selectedSalaryRecord = salaryRecords.find((record) => record.month === calendarMonthKey);
  const salaryRecordMismatch = isCurrentCalendarMonth && selectedSalaryRecord
    ? selectedSalaryRecord.workdays !== workdays || Math.abs(selectedSalaryRecord.netSalary - netSalary) >= 0.01
    : false;
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
    if (!isCurrentCalendarMonth) return;
    const month = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
    setSalaryStatus("saving");
    try {
      const response = await fetch("/api/salary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, workdays }),
      });
      if (!response.ok) throw new Error("Save failed");
      const { record } = await response.json() as { record: SalaryRecord };
      setSalaryRecords((records) => [record, ...records.filter((item) => item.month !== record.month)].slice(0, 12));
      setSalaryStatus("saved");
    } catch {
      setSalaryStatus("error");
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

  const exportHealthRecords = () => {
    if (healthHistory.length === 0) return;
    const headers = ["日期", "步数", "活动能量(kcal)", "静息能量(kcal)", "总能量(kcal)", "锻炼(分钟)", "睡眠(分钟)", "静息心率(次/分)", "体重(kg)", "来源", "更新时间"];
    const rows = healthHistory.map((record) => [
      record.date,
      record.steps,
      record.activeEnergyKcal,
      record.restingEnergyKcal,
      record.activeEnergyKcal + record.restingEnergyKcal,
      record.exerciseMinutes,
      record.sleepMinutes ?? "",
      record.restingHeartRateBpm ?? "",
      record.weightKg ?? "",
      record.source,
      record.updatedAt,
    ]);
    const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `璀璨人生-健康数据-${today.year}-${String(today.month + 1).padStart(2, "0")}-${String(today.day).padStart(2, "0")}.csv`;
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
      setWorkExperiences((items) => (experienceEditingId
        ? items.map((item) => item.id === experience.id ? experience : item)
        : [...items, experience]).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id));
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
        <SiteNavigation sitePage={sitePage} onChange={setSitePage} />
        {sitePage === "home" ? (
          <HomePage
            today={today}
            dailyQuote={dailyQuote}
            healthLoadStatus={healthLoadStatus}
            steps={steps}
            stepGoal={stepGoal}
            stepProgress={stepProgress}
            activeEnergy={activeEnergy}
            workdays={workdays}
            healthHistoryDays={healthHistory.length}
            netSalary={netSalary}
            workExperienceCount={workExperiences.length}
            money={money}
            onOpenDashboard={openDashboard}
          />
        ) : (
        <div className="content">
          <DashboardHeader today={today} />
          <DataQuickNav activeSection={activeSection} onOpen={openDashboard} />

          <div className="grid">
            <HealthOverviewCard
              active={activeSection === "overview"}
              showHealthGuide={showHealthGuide}
              showHealthTrend={showHealthTrend}
              healthHistoryLength={healthHistory.length}
              health={health}
              healthLoadStatus={healthLoadStatus}
              healthFreshness={healthFreshness}
              latestSyncedHealth={latestSyncedHealth}
              latestUploadLabel={formatShanghaiDateTime(latestSyncedHealth?.updatedAt)}
              missingTodayMetrics={missingTodayMetrics}
              healthMetric={healthMetric}
              healthPeriod={healthPeriod}
              healthMetricAverageLabel={healthMetricAverageLabel}
              healthMetricConfig={healthMetricConfig}
              healthMetricHistory={healthMetricHistory}
              healthMetricMax={healthMetricMax}
              totalEnergy={totalEnergy}
              activeEnergy={activeEnergy}
              exerciseHours={exerciseHours}
              healthMetricValue={healthMetricValue}
              onExport={exportHealthRecords}
              onToggleTrend={() => { setShowHealthTrend((value) => !value); setShowHealthGuide(false); }}
              onToggleGuide={() => setShowHealthGuide((value) => !value)}
              onReload={loadHealthData}
              onMetricChange={setHealthMetric}
              onPeriodChange={setHealthPeriod}
            />

            <WorkCalendarCard
              active={activeSection === "calendar"}
              calendarEditing={calendarEditing}
              monthLabel={monthLabel}
              calendarWorkdays={calendarWorkdays}
              showAnnualStats={showAnnualStats}
              showCalendarNotes={showCalendarNotes}
              calendarMonth={calendarMonth}
              calendarLoadStatus={calendarLoadStatus}
              annualWorkdayTotal={annualWorkdayTotal}
              annualWorkdays={annualWorkdays}
              calendarNote={calendarNote}
              calendarNoteStatus={calendarNoteStatus}
              lastCalendarChange={lastCalendarChange}
              savingDate={savingDate}
              calendarOverridesCount={Object.keys(calendarOverrides).length}
              resettingCalendar={resettingCalendar}
              calendarRows={calendarRows}
              calendarDays={calendarDayViews}
              onToggleAnnual={() => { setShowAnnualStats((value) => !value); setShowCalendarNotes(false); setCalendarEditing(false); }}
              onToggleNotes={() => { setShowCalendarNotes((value) => !value); setShowAnnualStats(false); setCalendarEditing(false); }}
              onToggleEditing={() => { setCalendarEditing((value) => !value); setShowAnnualStats(false); setShowCalendarNotes(false); }}
              onChangeMonth={changeCalendarMonth}
              onReload={() => setCalendarReloadKey((value) => value + 1)}
              onSelectAnnualMonth={(month) => { setCalendarMonth({ year: calendarMonth.year, month }); setShowAnnualStats(false); }}
              onSaveNote={saveCalendarNote}
              onNoteChange={(field, value) => setCalendarNote((note) => ({ ...note, [field]: value }))}
              onUndo={undoCalendarChange}
              onReset={resetOfficialCalendar}
              onToggleDay={toggleWorkday}
            />

            <DailyGoalsColumn
              active={activeSection === "goals"}
              steps={steps}
              stepGoal={stepGoal}
              stepProgress={stepProgress}
              healthLoadStatus={healthLoadStatus}
              hasTodayHealth={health !== null}
              editingStepGoal={editingStepGoal}
              stepGoalDraft={stepGoalDraft}
              latestWeight={latestWeight}
              recentWeightHistory={recentWeightHistory}
              recentWeightMin={recentWeightMin}
              recentWeightRange={recentWeightRange}
              weightChange={weightChange}
              onStartEditing={() => setEditingStepGoal(true)}
              onDraftChange={setStepGoalDraft}
              onSave={saveStepGoal}
              onCancel={() => { setStepGoalDraft(String(stepGoal)); setEditingStepGoal(false); }}
            />

            <WorkExperienceTimeline
              active={activeSection === "habits"}
              formOpen={experienceFormOpen}
              editingId={experienceEditingId}
              status={experienceStatus}
              draft={experienceDraft}
              experiences={workExperiences}
              expandedId={expandedExperienceId}
              onOpenForm={openExperienceForm}
              onCloseForm={() => setExperienceFormOpen(false)}
              onDraftChange={(field, value) => setExperienceDraft((draft) => ({ ...draft, [field]: value }))}
              onSave={saveWorkExperience}
              onReload={loadWorkExperiences}
              onToggleExpanded={setExpandedExperienceId}
              onDelete={deleteWorkExperience}
              formatDuration={experienceDuration}
            />

            <SalaryDashboard
              active={activeSection === "salary"}
              monthLabel={monthLabel}
              calendarMonthKey={calendarMonthKey}
              workdays={workdays}
              dailyRate={dailyRate}
              deductions={deductions}
              taxThreshold={taxThreshold}
              taxRate={taxRate}
              leaveDeduction={leaveDeduction}
              grossSalary={grossSalary}
              taxableIncome={taxableIncome}
              incomeTax={incomeTax}
              netSalary={netSalary}
              salaryRecordMismatch={Boolean(salaryRecordMismatch)}
              selectedSalaryRecord={selectedSalaryRecord}
              salaryStatus={salaryStatus}
              salaryRecords={salaryRecords}
              salaryLoadStatus={salaryLoadStatus}
              salaryTrend={salaryTrend}
              salaryTrendMax={salaryTrendMax}
              isCurrentCalendarMonth={isCurrentCalendarMonth}
              money={money}
              onSave={saveSalaryRecord}
              onExport={exportSalaryRecords}
              onReload={loadSalaryData}
            />
          </div>
        </div>
        )}
      </section>
    </main>
  );
}
