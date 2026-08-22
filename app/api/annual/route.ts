import { asc, and, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  calendarOverrides,
  financeTransactions,
  healthDaily,
  salaryRecords,
  workExperiences,
} from "../../../db/schema";
import { generateAnnualSummaryDraft } from "../../features/annual/domain";
import { toFinanceRecord } from "../../features/finance/import-service";
import { hasDashboardAccess } from "../access";

const jsonHeaders = { "Cache-Control": "no-store" };

const shanghaiDateKey = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json(
      { error: "Cloudflare Access login required" },
      { status: 401, headers: jsonHeaders },
    );
  }

  const yearText = new URL(request.url).searchParams.get("year") ?? "";
  if (!/^20\d{2}$/.test(yearText)) {
    return Response.json(
      { error: "year must use YYYY" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const year = Number(yearText);
  const dateStart = `${yearText}-01-01`;
  const dateEnd = `${year + 1}-01-01`;
  const monthStart = `${yearText}-01`;
  const monthEnd = `${year + 1}-01`;

  try {
    const db = getDb();
    const [healthRecords, overrides, salaries, financeRows, experiences] = await Promise.all([
      db
        .select()
        .from(healthDaily)
        .where(and(gte(healthDaily.date, dateStart), lt(healthDaily.date, dateEnd)))
        .orderBy(asc(healthDaily.date)),
      db
        .select()
        .from(calendarOverrides)
        .where(
          and(
            gte(calendarOverrides.date, dateStart),
            lt(calendarOverrides.date, dateEnd),
          ),
        ),
      db
        .select()
        .from(salaryRecords)
        .where(
          and(
            gte(salaryRecords.month, monthStart),
            lt(salaryRecords.month, monthEnd),
          ),
        )
        .orderBy(asc(salaryRecords.month)),
      db
        .select()
        .from(financeTransactions)
        .where(
          and(
            gte(financeTransactions.occurredAt, `${dateStart}T00:00:00+08:00`),
            lt(financeTransactions.occurredAt, `${dateEnd}T00:00:00+08:00`),
          ),
        )
        .orderBy(asc(financeTransactions.occurredAt)),
      db
        .select()
        .from(workExperiences)
        .orderBy(asc(workExperiences.startDate), asc(workExperiences.id)),
    ]);
    const generatedAt = new Date().toISOString();
    const summary = generateAnnualSummaryDraft(year, {
      generatedAt,
      asOfDate: shanghaiDateKey(),
      healthRecords,
      calendarData: {
        overrides: Object.fromEntries(
          overrides.map((item) => [item.date, item.isWorkday]),
        ),
      },
      salaryRecords: salaries,
      financeTransactions: financeRows.map(toFinanceRecord),
      experiences,
    });

    return Response.json({ summary }, { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Annual summary unavailable";
    return Response.json({ error: message }, { status: 500, headers: jsonHeaders });
  }
}
