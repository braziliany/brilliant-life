"use client";

import { useEffect, useState } from "react";

type HealthDaily = {
  date: string;
  steps: number;
  activeEnergyKcal: number;
  restingEnergyKcal: number;
  exerciseMinutes: number;
  workoutCount: number;
  weightKg: number | null;
  sleepMinutes: number | null;
  restingHeartRateBpm: number | null;
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

type SalaryPolicy = {
  dailyRate: number;
  deductions: number;
  taxThreshold: number;
  taxRate: number;
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
  const [sitePage, setSitePage] = useState<"home" | "dashboard">("home");
  const [activeSection, setActiveSection] = useState("overview");
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDaily[]>([]);
  const [healthLoadStatus, setHealthLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [healthPeriod, setHealthPeriod] = useState<7 | 30>(7);
  const [healthMetric, setHealthMetric] = useState<"steps" | "activeEnergyKcal" | "exerciseMinutes" | "weightKg" | "sleepMinutes" | "restingHeartRateBpm">("steps");
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
              <div className="cardHead">
                <div><p className="eyebrow">Apple 健康</p><h2>{showHealthGuide ? "同步指南" : showHealthTrend ? "健康趋势" : "训练成果"}</h2></div>
                <div className="healthViewActions">
                  <button type="button" className="healthTrendToggle" onClick={exportHealthRecords} disabled={healthHistory.length === 0} aria-label="导出最近30天健康数据">CSV</button>
                  <button type="button" className={`healthTrendToggle${showHealthTrend && !showHealthGuide ? " active" : ""}`} onClick={() => { setShowHealthTrend((value) => !value); setShowHealthGuide(false); }}>{showHealthTrend && !showHealthGuide ? "今日" : "趋势"}</button>
                  <button type="button" className={`healthTrendToggle${showHealthGuide ? " active" : ""}`} onClick={() => setShowHealthGuide((value) => !value)}>{showHealthGuide ? "返回" : "同步"}</button>
                </div>
              </div>
              {showHealthGuide ? (
                <div className="healthGuide">
                  <div className="healthSyncCenter">
                    <div className="healthSyncCenterHead">
                      <div><span className={`healthSyncDot ${health ? "online" : healthLoadStatus === "error" ? "error" : ""}`} /><div><small>同步状态</small><strong>{healthFreshness}</strong></div></div>
                      <button type="button" onClick={loadHealthData} disabled={healthLoadStatus === "loading"}>{healthLoadStatus === "loading" ? "刷新中…" : "立即刷新"}</button>
                    </div>
                    <div className="healthSyncFacts">
                      <div><span>最近上传</span><b>{formatShanghaiDateTime(latestSyncedHealth?.updatedAt)}</b></div>
                      <div><span>数据日期</span><b>{latestSyncedHealth?.date ?? "尚无记录"}</b></div>
                      <div><span>今日指标</span><b>{!health ? "等待上传" : missingTodayMetrics.length ? `缺少 ${missingTodayMetrics.join("、")}` : "主要指标完整"}</b></div>
                    </div>
                    {!health && latestSyncedHealth && <p>服务器最后收到的是 {latestSyncedHealth.date} 的数据；请在 Health Auto Export 中手动运行一次“今天”导出。</p>}
                    {health && missingTodayMetrics.length > 0 && <p>今天的数据已收到，但 {missingTodayMetrics.join("、")} 尚未包含在上传内容中，请检查读取权限后重新导出。</p>}
                  </div>
                  <ol>
                    <li><b>选择指标</b><span>步数、活动能量、静息能量、Apple 锻炼时间、睡眠分析、静息心率；有体重秤后再启用体重。</span></li>
                    <li><b>设置来源</b><span>手表指标选择当前 Apple Watch，体重选择“健康”；旧名称的同一块手表可不选。</span></li>
                    <li><b>设置导出</b><span>JSON v2、日期范围“今天”、汇总数据开启、时间分组“天”、批量请求关闭。</span></li>
                    <li><b>检查结果</b><span>成功响应应包含 imported 和最新日期；HTTP 401 检查密钥，HTTP 400 检查所选指标。</span></li>
                  </ol>
                  <p>修改指标、来源或健康权限后，需要重新运行导出；仅勾选指标不会立即上传数据。</p>
                </div>
              ) : showHealthTrend ? (
                <div className="healthTrend">
                  <div className="healthTrendControls">
                    <div className="healthMetricTabs">
                      <button type="button" className={healthMetric === "steps" ? "active" : ""} onClick={() => setHealthMetric("steps")}>步数</button>
                      <button type="button" className={healthMetric === "activeEnergyKcal" ? "active" : ""} onClick={() => setHealthMetric("activeEnergyKcal")}>能量</button>
                      <button type="button" className={healthMetric === "exerciseMinutes" ? "active" : ""} onClick={() => setHealthMetric("exerciseMinutes")}>锻炼</button>
                      <button type="button" className={healthMetric === "weightKg" ? "active" : ""} onClick={() => setHealthMetric("weightKg")}>体重</button>
                      <button type="button" className={healthMetric === "sleepMinutes" ? "active" : ""} onClick={() => setHealthMetric("sleepMinutes")}>睡眠</button>
                      <button type="button" className={healthMetric === "restingHeartRateBpm" ? "active" : ""} onClick={() => setHealthMetric("restingHeartRateBpm")}>心率</button>
                    </div>
                    <div className="healthPeriodTabs"><button type="button" className={healthPeriod === 7 ? "active" : ""} onClick={() => setHealthPeriod(7)}>7天</button><button type="button" className={healthPeriod === 30 ? "active" : ""} onClick={() => setHealthPeriod(30)}>30天</button></div>
                  </div>
                  <div className="healthTrendSummary"><span>{healthMetric === "weightKg" || healthMetric === "sleepMinutes" ? "平均" : "日均"}</span><strong>{healthMetricAverageLabel}</strong><small>{healthMetricConfig.unit}</small>{health && <span className="healthSyncStatus">最近同步 {health.date} · {health.source === "health-auto-export" ? "Apple 健康" : health.source}</span>}</div>
                  {healthMetricHistory.length ? (
                    <div className={`healthBars${healthPeriod === 30 ? " compact" : ""}`} aria-label={`最近${healthPeriod}天${healthMetricConfig.label}趋势`}>
                      {healthMetricHistory.map((item) => (
                        <div className="healthBarDay" key={item.date} title={`${item.date}：${healthMetric === "weightKg" || healthMetric === "sleepMinutes" ? healthMetricValue(item).toFixed(1) : Math.round(healthMetricValue(item)).toLocaleString("zh-CN")} ${healthMetricConfig.unit}`}>
                          <i style={{ height: `${Math.max(4, Math.round(healthMetricValue(item) / healthMetricMax * 100))}%`, background: healthMetricConfig.color }} />
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
                <div>
                  <p className="eyebrow">每日目标</p>
                  <h2>今日步数</h2>
                  <strong>{steps.toLocaleString("zh-CN")}</strong><span> / {stepGoal.toLocaleString("zh-CN")} 步</span>
                  {healthLoadStatus === "ready" && !health && <small className="todayHealthPending">等待今日同步</small>}
                  {editingStepGoal ? (
                    <form className="stepGoalForm" onSubmit={saveStepGoal}>
                      <input
                        type="number"
                        min="1000"
                        max="100000"
                        step="500"
                        aria-label="每日步数目标"
                        value={stepGoalDraft}
                        onChange={(event) => setStepGoalDraft(event.target.value)}
                        autoFocus
                      />
                      <button type="submit">保存</button>
                      <button type="button" onClick={() => { setStepGoalDraft(String(stepGoal)); setEditingStepGoal(false); }}>取消</button>
                    </form>
                  ) : (
                    <button type="button" className="textButton" onClick={() => setEditingStepGoal(true)}>调整目标 →</button>
                  )}
                </div>
                <div className="progressRing" style={{ background: `conic-gradient(var(--coral) 0 ${stepProgress}%, #eceae5 ${stepProgress}%)` }}><div><b>{stepProgress}%</b><small>已完成</small></div></div>
              </article>
              <article className="card weight">
                <div className="cardHead"><div><p className="eyebrow">Apple 健康</p><h2>体重趋势</h2></div><strong>{latestWeight === null ? "—" : latestWeight.toFixed(1)}<small>{latestWeight === null ? "等待同步" : " kg"}</small></strong></div>
                {recentWeightHistory.length ? (
                  <>
                    <div className="weightSparkline" aria-label={`最近 ${recentWeightHistory.length} 次体重记录`}>
                      {recentWeightHistory.map((item) => <i key={item.date} title={`${item.date}：${item.weightKg?.toFixed(1)} kg`} style={{ height: `${24 + ((item.weightKg ?? recentWeightMin) - recentWeightMin) / recentWeightRange * 76}%` }} />)}
                    </div>
                    <div className="weightLabels"><span>最近 {recentWeightHistory.length} 次记录</span><b className={weightChange !== null && weightChange > 0 ? "weightUp" : "weightDown"}>{weightChange === null ? "暂无变化" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg`}</b></div>
                  </>
                ) : <div className="weightEmpty">在 Health Auto Export 中选择“体重”后即可显示趋势</div>}
              </article>
            </div>

            <article id="habits" className={`card habits${activeSection === "habits" ? " sectionActive" : ""}`}>
              <div className="cardHead">
                <div><p className="eyebrow">职业档案</p><h2>工作经历</h2></div>
                <button type="button" className="addButton" onClick={() => openExperienceForm()}>＋ 添加经历</button>
              </div>
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
                <div className="experienceList timeline">
                  {experienceStatus === "loading" && <p className="experienceEmpty">正在读取工作经历…</p>}
                  {experienceStatus === "error" && <div className="moduleState" role="alert"><p>工作经历读取失败。</p><button type="button" onClick={loadWorkExperiences}>重新加载</button></div>}
                  {experienceStatus === "idle" && workExperiences.length === 0 && <button type="button" className="experienceEmpty addExperienceEmpty" onClick={() => openExperienceForm()}>还没有工作经历，点击添加第一条</button>}
                  {workExperiences.map((experience) => {
                    const expanded = expandedExperienceId === experience.id;
                    return (
                    <div className={`experienceItem${expanded ? " expanded" : ""}`} key={experience.id}>
                      <span className="experienceMark" aria-hidden="true" />
                      <div className="experienceContent">
                        <b>{experience.role}</b><strong>{experience.company}</strong>
                        <small>{experience.startDate} — {experience.endDate ?? "至今"} · {experienceDuration(experience.startDate, experience.endDate)}</small>
                        {experience.summary && <p>{experience.summary}</p>}
                      </div>
                      <div className="experienceActions">
                        <button type="button" onClick={() => setExpandedExperienceId(expanded ? null : experience.id)}>{expanded ? "收起" : "详情"}</button>
                        <button type="button" onClick={() => openExperienceForm(experience)}>编辑</button>
                        <button type="button" className="deleteExperience" onClick={() => deleteWorkExperience(experience)}>删除</button>
                      </div>
                    </div>
                  )})}
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

              <div className="salarySummary">
                <div className="netPay">
                  <span>当前日历预计实发</span>
                  <strong>¥ {money(netSalary)}</strong>
                  <small>按 {workdays} 个工作日实时计算</small>
                </div>
                <div className="salaryMetrics">
                  <div><span>应发工资</span><b>¥ {money(grossSalary)}</b><small>工作日 × 日薪</small></div>
                  <div><span>全部扣除</span><b>− ¥ {money(deductions + leaveDeduction)}</b><small>固定扣除</small></div>
                  <div><span>计税收入</span><b>¥ {money(taxableIncome)}</b><small>扣除后再减 ¥{money(taxThreshold)}</small></div>
                  <div><span>个人所得税</span><b>− ¥ {money(incomeTax)}</b><small>计税收入 × {taxRate}%</small></div>
                </div>
              </div>

              <div className="salaryFormula">
                <span>计算公式</span>
                <code>实发 = 工作日 × 日薪 + 额外收入 + 奖金 − 固定扣除 − 请假扣款 − 个税</code>
              </div>
              {salaryRecordMismatch && selectedSalaryRecord && (
                <div className="salaryMismatch" role="status">
                  <div>
                    <b>{monthLabel}的日历与已保存工资不一致</b>
                    <span>当前日历 {workdays} 天，预计实发 ¥{money(netSalary)}；历史记录 {selectedSalaryRecord.workdays} 天，已保存实发 ¥{money(selectedSalaryRecord.netSalary)}。</span>
                  </div>
                  <button type="button" onClick={saveSalaryRecord} disabled={salaryStatus === "saving"}>
                    {salaryStatus === "saving" ? "同步中…" : `同步为 ${workdays} 天`}
                  </button>
                </div>
              )}
              <div className="salaryHistoryHead">
                <div><p className="eyebrow">月度档案</p><h3>工资历史</h3></div>
                <div className="salaryHistoryActions">
                  <button type="button" className="exportSalary" onClick={exportSalaryRecords} disabled={salaryRecords.length === 0}>导出 CSV</button>
                  <button type="button" className="saveSalary" onClick={saveSalaryRecord} disabled={salaryStatus === "saving" || !isCurrentCalendarMonth}>
                    {!isCurrentCalendarMonth ? "历史已锁定" : salaryStatus === "saving" ? "保存中…" : salaryStatus === "saved" ? "已保存" : "保存本月"}
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
                  <div className="moduleState" role="alert"><p>工资记录读取失败，固定计算规则仍可使用。</p><button type="button" onClick={loadSalaryData}>重新加载</button></div>
                ) : salaryRecords.length === 0 ? (
                  <p className="emptySalary">还没有工资记录，点击“保存本月”建立第一条档案。</p>
                ) : salaryRecords.map((record) => (
                  <div className={`salaryRecord${record.month === calendarMonthKey && salaryRecordMismatch ? " outOfSync" : ""}`} key={record.month}>
                    <div><b>{record.month.replace("-", " 年 ")} 月</b><small>{record.workdays} 个工作日 · 加项 ¥{money(record.extraIncome + record.bonus)}{record.month === calendarMonthKey && salaryRecordMismatch ? " · 待同步" : ""}</small></div>
                    <span>应发 ¥{money(record.grossSalary)}</span>
                    <span>个税 ¥{money(record.incomeTax)}</span>
                    <strong>已保存实发 ¥{money(record.netSalary)}</strong>
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
