"use client";

import { useEffect, useState } from "react";
import { HomePage } from "./components/home/HomePage";
import { DashboardHeader } from "./components/shell/DashboardHeader";
import { DataQuickNav } from "./components/shell/DataQuickNav";
import { DataCenterOverview } from "./components/shell/DataCenterOverview";
import { SiteNavigation } from "./components/shell/SiteNavigation";
import { HealthOverviewCard } from "./features/health/HealthOverviewCard";
import { DailyGoalsColumn } from "./features/health/DailyGoalsColumn";
import {
  calculateHealthSummary,
  calculateHealthTrend,
  calculateHealthIngestionContinuity,
  findLatestSuccessfulIngestionForDate,
  findLatestSuccessfulHealthIngestion,
  formatHealthSyncDateTime,
  getHealthMetricKeysForRecord,
  getSuccessfulHealthMetricKeysForDate,
  calculateWeightTrend,
  getHealthMetricValue,
  selectTodayHealth,
  toChronologicalHealthHistory,
} from "./features/health/domain";
import { WorkCalendarCard } from "./features/calendar/WorkCalendarCard";
import {
  calculateAnnualWorkdays,
  calendarDateKey,
  countCalendarMonthWorkdays,
  getCalendarMonthShape,
  getHolidayCalendar,
  getWorkdayToggle,
  resolveCalendarDay,
  shiftCalendarMonth,
  summarizeCalendarMonthProgress,
} from "./features/calendar/domain";
import { WorkExperienceTimeline } from "./features/career/WorkExperienceTimeline";
import {
  createEmptyWorkExperienceDraft,
  formatWorkExperienceDuration,
  removeWorkExperience,
  selectCurrentCareerStage,
  toWorkExperienceDraft,
  upsertWorkExperience,
} from "./features/career/domain";
import { SalaryDashboard } from "./features/salary/SalaryDashboard";
import { calculateSalarySummary, summarizeSavedSalaryYear } from "./features/salary/domain";
import { AnnualReportPage } from "./features/annual/AnnualReportPage";
import { LifeFinancePanel } from "./features/finance/LifeFinancePanel";
import type { CalendarDayView, CalendarNote, HealthDaily, HealthIngestionRun, HealthMetric, SalaryPolicy, SalaryRecord, SitePage, WorkExperience, WorkExperienceDraft } from "./page-view.types";

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

const genshinQuotes = [
  { text: "旅程总有一天会迎来终点，不必匆忙。", source: "钟离" },
  { text: "我们终将重逢。", source: "旅行者" },
  { text: "向着星辰与深渊！", source: "凯瑟琳" },
  { text: "在黎明到来之前，必须有人稍微照亮黑暗。", source: "迪卢克" },
  { text: "风带来了故事的种子，时间使之发芽。", source: "蒙德古语" },
] as const;

export default function Home() {
  const [sitePage, setSitePage] = useState<SitePage>("home");
  const [activeSection, setActiveSection] = useState("data-overview");
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDaily[]>([]);
  const [healthIngestions, setHealthIngestions] = useState<HealthIngestionRun[]>([]);
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
  const [experienceDraft, setExperienceDraft] = useState<WorkExperienceDraft>(createEmptyWorkExperienceDraft);
  const [expandedExperienceId, setExpandedExperienceId] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = getShanghaiDate();
    return { year: now.year, month: now.month };
  });
  const today = getShanghaiDate();
  const quoteDay = Math.floor(Date.UTC(today.year, today.month, today.day) / 86_400_000);
  const dailyQuote = genshinQuotes[quoteDay % genshinQuotes.length];
  const todayKey = calendarDateKey(today.year, today.month, today.day);
  const { calendarDays, calendarRows } = getCalendarMonthShape(calendarMonth.year, calendarMonth.month);
  const calendarDayViews: CalendarDayView[] = calendarDays.map((day, index) => {
    if (day === null) return { key: `empty-${index}`, day: null };
    const { date: key, holiday, makeup, workday, personalOverride } = resolveCalendarDay(calendarMonth.year, calendarMonth.month, day, calendarOverrides);
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
  const calendarWorkdays = countCalendarMonthWorkdays(calendarMonth.year, calendarMonth.month, calendarOverrides);
  const holidayCalendarConfigured = getHolidayCalendar(calendarMonth.year).status === "configured";
  const { monthlyWorkdays: annualWorkdays, totalWorkdays: annualWorkdayTotal } = calculateAnnualWorkdays(calendarMonth.year, annualOverrides);
  const monthLabel = `${calendarMonth.year}年${calendarMonth.month + 1}月`;
  const calendarMonthKey = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
  const currentMonthKey = `${today.year}-${String(today.month + 1).padStart(2, "0")}`;
  const isCurrentCalendarMonth = calendarMonthKey === currentMonthKey;
  const workdays = calendarWorkdays;
  const calendarProgress = summarizeCalendarMonthProgress(calendarMonth.year, calendarMonth.month, todayKey, calendarOverrides);
  const { recentWeightHistory, latestWeight, weightChange, recentWeightMin, recentWeightRange } = calculateWeightTrend(healthHistory);
  const healthMetricConfig = {
    steps: { label: "步数", unit: "步", color: "var(--lime)" },
    activeEnergyKcal: { label: "活动能量", unit: "千卡", color: "var(--coral)" },
    exerciseMinutes: { label: "锻炼时长", unit: "分钟", color: "#54d6ff" },
    weightKg: { label: "体重", unit: "kg", color: "#c28cff" },
    sleepMinutes: { label: "睡眠时长", unit: "小时", color: "#768cff" },
    restingHeartRateBpm: { label: "静息心率", unit: "次/分", color: "#ff7aa2" },
  }[healthMetric];
  const { metricHistory: healthMetricHistory, metricMax: healthMetricMax, metricAverageLabel: healthMetricAverageLabel } = calculateHealthTrend(healthHistory, healthPeriod, healthMetric);
  const healthMetricValue = (item: HealthDaily) => getHealthMetricValue(item, healthMetric);
  const latestSyncedHealth = healthHistory.at(-1) ?? null;
  const latestHealthIngestion = findLatestSuccessfulHealthIngestion(healthIngestions);
  const latestTodayIngestion = findLatestSuccessfulIngestionForDate(healthIngestions, todayKey);
  const todayHealthMetricKeys = getHealthMetricKeysForRecord(health)
    ?? getSuccessfulHealthMetricKeysForDate(healthIngestions, todayKey);
  const todayHealthSynced = latestTodayIngestion !== null;
  const { steps, stepProgress, activeEnergy, totalEnergy, exerciseHours } = calculateHealthSummary(
    todayHealthSynced ? health : null,
    stepGoal,
    todayHealthMetricKeys,
  );
  const ingestionContinuity = calculateHealthIngestionContinuity(healthIngestions, todayKey);
  const ingestionMetricLabels: Record<string, string> = {
    steps: "步数",
    activeEnergyKcal: "活动能量",
    restingEnergyKcal: "静息能量",
    exerciseMinutes: "锻炼时间",
    workoutCount: "训练次数",
    weightKg: "体重",
    sleepMinutes: "睡眠",
    restingHeartRateBpm: "静息心率",
  };
  const ingestionContinuityLabel = healthIngestions.length === 0
    ? "上传连续性将在下一次同步后开始记录"
    : `近7天成功上传 ${ingestionContinuity.successfulDateKeys.length}/7 天${ingestionContinuity.missingDateKeys.length ? `，未收到 ${ingestionContinuity.missingDateKeys.join("、")}` : ""}${ingestionContinuity.failedDateKeys.length ? `，异常 ${ingestionContinuity.failedDateKeys.join("、")}` : ""}`;
  const todayUploadSummary = latestTodayIngestion
    ? `今天最近一次包含 ${latestTodayIngestion.metricKeys.map((key) => ingestionMetricLabels[key] ?? key).join("、") || "无支持指标"}`
    : "今日尚未同步";
  const expectedTodayMetricKeys = ["steps", "activeEnergyKcal", "restingEnergyKcal", "exerciseMinutes", "sleepMinutes", "restingHeartRateBpm"];
  const missingTodayMetrics = todayHealthSynced
    ? expectedTodayMetricKeys.filter((key) => !todayHealthMetricKeys.includes(key)).map((key) => ingestionMetricLabels[key])
    : [];
  const healthFreshness = healthLoadStatus === "loading"
    ? "正在检查"
    : healthLoadStatus === "error"
      ? "读取失败"
      : todayHealthSynced
        ? "今天已同步"
        : "今日尚未同步";

  const loadHealthData = () => {
    setHealthLoadStatus("loading");
    fetch("/api/health?days=30", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health data unavailable");
        return response.json() as Promise<{ health: HealthDaily | null; history: HealthDaily[]; ingestions?: HealthIngestionRun[] }>;
      })
      .then(({ history, ingestions = [] }) => {
        setHealth(selectTodayHealth(history, todayKey));
        setHealthHistory(toChronologicalHealthHistory(history));
        setHealthIngestions(ingestions);
        setHealthLoadStatus("ready");
      })
      .catch(() => {
        setHealth(null);
        setHealthHistory([]);
        setHealthIngestions([]);
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
  const { grossSalary, taxableIncome, incomeTax, netSalary } = calculateSalarySummary(workdays, salaryPolicy);
  const selectedSalaryRecord = salaryRecords.find((record) => record.month === calendarMonthKey);
  const salaryRecordMismatch = holidayCalendarConfigured && isCurrentCalendarMonth && selectedSalaryRecord
    ? selectedSalaryRecord.workdays !== workdays || Math.abs(selectedSalaryRecord.netSalary - netSalary) >= 0.01
    : false;
  const salaryTrend = [...salaryRecords].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  const salaryTrendMax = Math.max(1, ...salaryTrend.map((record) => record.grossSalary));
  const salaryYearFacts = summarizeSavedSalaryYear(salaryRecords, today.year);
  const currentCareer = selectCurrentCareerStage(workExperiences, currentMonthKey);
  const money = (value: number) =>
    new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const openDashboard = (section = "data-overview") => {
    setSitePage("dashboard");
    setActiveSection(section);
    window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const changeCalendarMonth = (offset: number) => {
    setLastCalendarChange(null);
    setCalendarMonth((current) => shiftCalendarMonth(current, offset));
  };

  const toggleWorkday = async (day: number) => {
    if (!calendarEditing) return;
    const { date: key, hadOverride, previous: current, next } = getWorkdayToggle(calendarMonth.year, calendarMonth.month, day, calendarOverrides);
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
    if (!isCurrentCalendarMonth || !holidayCalendarConfigured) return;
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
    setExperienceDraft(experience ? toWorkExperienceDraft(experience) : createEmptyWorkExperienceDraft());
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
      setWorkExperiences((items) => upsertWorkExperience(items, experience, experienceEditingId));
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
      setWorkExperiences((items) => removeWorkExperience(items, experience.id));
    } catch {
      setExperienceStatus("error");
    }
  };

  return (
    <main className="pageShell">
      <section className="dashboard">
        <SiteNavigation onChange={setSitePage} />
        {sitePage === "home" ? (
          <HomePage
            today={today}
            dailyQuote={dailyQuote}
            healthLoadStatus={healthLoadStatus}
            steps={steps}
            stepGoal={stepGoal}
            stepProgress={stepProgress}
            activeEnergy={activeEnergy}
            todayHealthSynced={todayHealthSynced}
            workdays={workdays}
            healthHistoryDays={healthHistory.length}
            netSalary={netSalary}
            workExperienceCount={workExperiences.length}
            money={money}
            onOpenDashboard={openDashboard}
            onOpenAnnual={() => setSitePage("annual")}
          />
        ) : sitePage === "annual" ? (
          <AnnualReportPage initialYear={today.year} />
        ) : (
        <div className="content">
          <DashboardHeader today={today} />
          <DataQuickNav activeSection={activeSection} onOpen={openDashboard} />

          <DataCenterOverview
            active={activeSection === "data-overview"}
            hasTodayHealth={todayHealthSynced}
            healthLoadStatus={healthLoadStatus}
            steps={steps}
            monthLabel={monthLabel}
            elapsedWorkdays={calendarProgress.elapsedWorkdays}
            remainingWorkdays={calendarProgress.remainingWorkdays}
            calendarReady={calendarLoadStatus === "ready"}
            savedSalaryMonths={salaryYearFacts.savedMonths}
            totalNetSalary={salaryYearFacts.totalNetSalary}
            salaryReady={salaryLoadStatus === "ready"}
            currentCareer={currentCareer}
            money={money}
            onOpen={openDashboard}
          />

          <div className="grid">
            <HealthOverviewCard
              active={activeSection === "health"}
              showHealthGuide={showHealthGuide}
              showHealthTrend={showHealthTrend}
              healthHistoryLength={healthHistory.length}
              healthLoadStatus={healthLoadStatus}
              healthFreshness={healthFreshness}
              todayHealthSynced={todayHealthSynced}
              latestSyncedHealth={latestSyncedHealth}
              latestUploadLabel={formatHealthSyncDateTime(latestHealthIngestion?.receivedAt)}
              ingestionContinuityLabel={ingestionContinuityLabel}
              todayUploadSummary={todayUploadSummary}
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
              active={activeSection === "time"}
              calendarEditing={calendarEditing}
              monthLabel={monthLabel}
              calendarWorkdays={calendarWorkdays}
              elapsedWorkdays={calendarProgress.elapsedWorkdays}
              remainingWorkdays={calendarProgress.remainingWorkdays}
              holidayDays={calendarProgress.holidayDays}
              makeupWorkdays={calendarProgress.makeupWorkdays}
              personalAdjustments={calendarProgress.personalAdjustments}
              holidayCalendarConfigured={holidayCalendarConfigured}
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
              active={activeSection === "health"}
              steps={steps}
              stepGoal={stepGoal}
              stepProgress={stepProgress}
              healthLoadStatus={healthLoadStatus}
              hasTodayHealth={todayHealthSynced}
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
              active={activeSection === "career"}
              formOpen={experienceFormOpen}
              editingId={experienceEditingId}
              status={experienceStatus}
              draft={experienceDraft}
              experiences={workExperiences}
              currentExperience={currentCareer}
              expandedId={expandedExperienceId}
              onOpenForm={openExperienceForm}
              onCloseForm={() => setExperienceFormOpen(false)}
              onDraftChange={(field, value) => setExperienceDraft((draft) => ({ ...draft, [field]: value }))}
              onSave={saveWorkExperience}
              onReload={loadWorkExperiences}
              onToggleExpanded={setExpandedExperienceId}
              onDelete={deleteWorkExperience}
              formatDuration={(startDate, endDate) => formatWorkExperienceDuration(startDate, endDate, currentMonthKey)}
            />

            <SalaryDashboard
              active={activeSection === "finance"}
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
              yearSavedMonths={salaryYearFacts.savedMonths}
              yearTotalNetSalary={salaryYearFacts.totalNetSalary}
              yearTotalIncomeTax={salaryYearFacts.totalIncomeTax}
              salaryLoadStatus={salaryLoadStatus}
              salaryTrend={salaryTrend}
              salaryTrendMax={salaryTrendMax}
              isCurrentCalendarMonth={isCurrentCalendarMonth}
              holidayCalendarConfigured={holidayCalendarConfigured}
              money={money}
              onSave={saveSalaryRecord}
              onExport={exportSalaryRecords}
              onReload={loadSalaryData}
            />
            <LifeFinancePanel active={activeSection === "life-finance"} year={today.year} />
          </div>
        </div>
        )}
      </section>
    </main>
  );
}
