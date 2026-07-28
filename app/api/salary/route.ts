import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { salaryRecords } from "../../../db/schema";
import { hasDashboardAccess } from "../access";
import { validSalaryRecord } from "../validation";
import { calculateSalary, SALARY_POLICY } from "./policy";

const jsonHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const records = await getDb().select().from(salaryRecords).orderBy(desc(salaryRecords.month)).limit(12);
    return Response.json({ records, policy: SALARY_POLICY }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Salary database unavailable" }, { status: 500, headers: jsonHeaders });
  }
}

export async function PUT(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (!validSalaryRecord(payload)) {
      return Response.json({ error: "Invalid salary record" }, { status: 400, headers: jsonHeaders });
    }
    const db = getDb();
    const calculated = calculateSalary(payload.workdays);
    const values = {
      month: payload.month,
      workdays: payload.workdays,
      ...calculated,
      updatedAt: new Date().toISOString(),
    };

    await db.insert(salaryRecords).values(values).onConflictDoUpdate({
      target: salaryRecords.month,
      set: values,
    });
    return Response.json({ record: values }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Salary update failed" }, { status: 500, headers: jsonHeaders });
  }
}
