import { useEffect, useRef, useState } from "react";
import { validDate } from "../../api/validation";
import { effectiveCalendarOverrides, type CalendarOverrides, type CalendarWorkRecords } from "./domain";

export type AnnualCalendarStatus = "idle" | "loading" | "ready" | "error";

function readYearData(payload: unknown, year: number): CalendarOverrides {
  const data = payload as { overrides?: unknown; workRecords?: unknown } | null;
  if (!data || !Array.isArray(data.overrides) || !Array.isArray(data.workRecords)) throw new Error("Invalid annual Calendar data");
  const overrides: CalendarOverrides = {};
  const records: CalendarWorkRecords = {};
  for (const row of data.overrides) {
    if (!row || !validDate(row.date) || !row.date.startsWith(`${year}-`) || typeof row.isWorkday !== "boolean") throw new Error("Invalid personal arrangement");
    overrides[row.date] = row.isWorkday;
  }
  for (const row of data.workRecords) {
    if (!row || !validDate(row.date) || !row.date.startsWith(`${year}-`) || typeof row.worked !== "boolean" ||
      !(row.hours === null || (typeof row.hours === "number" && Number.isFinite(row.hours) && row.hours >= 0 && row.hours <= 24)) ||
      (row.worked && row.hours === 0) || (!row.worked && row.hours !== null && row.hours !== 0)) throw new Error("Invalid actual work record");
    records[row.date] = { worked: row.worked, hours: row.hours };
  }
  return effectiveCalendarOverrides(overrides, records);
}

export function useAnnualCalendar(year: number, active: boolean, revision?: unknown) {
  const [cache, setCache] = useState<Record<number, CalendarOverrides>>({});
  const [request, setRequest] = useState<{ year: number; status: AnnualCalendarStatus }>({ year, status: "idle" });
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const id = ++sequence.current;
    const current = () => !controller.signal.aborted && sequence.current === id;
    setRequest({ year, status: "loading" });
    fetch(`/api/calendar?year=${year}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Annual Calendar unavailable");
        return readYearData(await response.json(), year);
      })
      .then(overrides => {
        if (!current()) return;
        setCache(values => ({ ...values, [year]: overrides }));
        setRequest({ year, status: "ready" });
      })
      .catch(() => { if (current()) setRequest({ year, status: "error" }); });
    return () => controller.abort();
  }, [year, active, revision, reload]);
  return {
    overrides: cache[year] ?? null,
    status: request.year === year ? request.status : active ? "loading" as const : "idle" as const,
    retry: () => setReload(value => value + 1),
  };
}
