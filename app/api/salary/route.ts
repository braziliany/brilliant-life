import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { salaryRecords } from "../../../db/schema";

const jsonHeaders = { "Cache-Control": "no-store" };

function hasDashboardAccess(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || request.headers.has("Cf-Access-Jwt-Assertion");
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const records = await getDb().select().from(salaryRecords).orderBy(desc(salaryRecords.month)).limit(12);
    return Response.json({ records }, { headers: jsonHeaders });
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
    if (
      typeof payload.month !== "string" ||
      !/^\d{4}-\d{2}$/.test(payload.month) ||
      typeof payload.workdays !== "number" ||
      !Number.isInteger(payload.workdays) ||
      payload.workdays < 0 ||
      payload.workdays > 31
    ) {
      return Response.json({ error: "Invalid salary record" }, { status: 400, headers: jsonHeaders });
    }

    const dailyRate = 275;
    const deductions = 130;
    const grossSalary = payload.workdays * dailyRate;
    const taxableIncome = Math.max(0, grossSalary - deductions - 5000);
    const incomeTax = taxableIncome * 0.03;
    const values = {
      month: payload.month,
      workdays: payload.workdays,
      dailyRate,
      deductions,
      grossSalary,
      taxableIncome,
      incomeTax,
      netSalary: grossSalary - deductions - incomeTax,
      updatedAt: new Date().toISOString(),
    };

    await getDb().insert(salaryRecords).values(values).onConflictDoUpdate({
      target: salaryRecords.month,
      set: values,
    });
    return Response.json({ record: values }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Salary update failed" }, { status: 500, headers: jsonHeaders });
  }
}
