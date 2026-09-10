import { asc, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { salaryRecords, workExperiences } from "../../../db/schema";
import { generateAnnualSummaryDraft } from "../../features/annual/domain";
import { collectTimelineYears, deriveTimelineItems } from "../../features/timeline/domain";
import { hasDashboardAccess } from "../access";

const jsonHeaders = { "Cache-Control": "no-store" };

const shanghaiDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(value);

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const db = getDb();
    const [experiences, salaries] = await Promise.all([
      db.select().from(workExperiences).orderBy(asc(workExperiences.startDate), asc(workExperiences.id)),
      db.select().from(salaryRecords).orderBy(desc(salaryRecords.month)),
    ]);
    const generatedAt = new Date().toISOString();
    const asOfDate = shanghaiDateKey();
    const currentYear = Number(asOfDate.slice(0, 4));
    const annualSummaries = collectTimelineYears(experiences, salaries, currentYear).map((year) =>
      generateAnnualSummaryDraft(year, {
        generatedAt,
        asOfDate,
        healthRecords: [],
        calendarData: {},
        salaryRecords: salaries,
        experiences,
      }),
    );

    return Response.json({
      items: deriveTimelineItems({ experiences, salaryRecords: salaries, annualSummaries }),
      asOfDate,
    }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Timeline unavailable" }, { status: 500, headers: jsonHeaders });
  }
}
