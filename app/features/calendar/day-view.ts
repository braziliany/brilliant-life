import { resolveCalendarDay, type CalendarOverrides, type CalendarWorkRecords } from "./domain.ts";
import type { CalendarDayView } from "../../page-view.types";

// Presentation only: the domain remains the source of the final work/rest fact.
export function buildCalendarDayView({ year, month, day, todayKey, overrides, records, editing, busy }: {
  year: number;
  month: number;
  day: number;
  todayKey: string;
  overrides: CalendarOverrides;
  records: CalendarWorkRecords;
  editing: boolean;
  busy: boolean;
}): CalendarDayView {
  const { date, holiday, makeup, officialWorkday, workday, personalOverride } = resolveCalendarDay(year, month, day, overrides, records);
  const record = records[date];
  const officialLabel = holiday ? `${holiday} · 法定休假` : makeup ? "官方调休上班" : officialWorkday ? "工作日" : "周末休息";
  const plannedLabel = personalOverride ? `${officialLabel} · 安排${overrides[date] ? "上班" : "休息"}` : officialLabel;
  const statusLabel = `${plannedLabel}${record ? ` · ${record.worked ? "实际上班" : "实际未上班"} · ${record.hours === null ? "工时未知" : `${record.hours}小时`}` : " · 未记录实际工时"}`;
  return {
    key: date,
    day,
    holiday,
    className: `${workday ? "workday" : "weekend"}${date === todayKey ? " today" : ""}${editing ? " editable" : ""}`,
    ariaLabel: `${month + 1}月${day}日，${statusLabel}${editing ? "，点击编辑安排和工时" : ""}`,
    title: `${statusLabel}${editing ? " · 点击编辑" : ""}`,
    disabled: !editing || busy,
  };
}
