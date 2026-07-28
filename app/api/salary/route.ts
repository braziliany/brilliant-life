import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { salaryRecords, salarySettings } from "../../../db/schema";
import { validSalaryAdjustments, validSalaryRecord, validSalarySettings } from "../validation";

const jsonHeaders = { "Cache-Control": "no-store" };
const defaultSettings = { dailyRate: 275, deductions: 130, taxThreshold: 5000, taxRate: 3 };

function hasDashboardAccess(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || request.headers.has("Cf-Access-Jwt-Assertion");
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const db = getDb();
    const [records, savedSettings] = await Promise.all([
      db.select().from(salaryRecords).orderBy(desc(salaryRecords.month)).limit(12),
      db.select().from(salarySettings).where(eq(salarySettings.id, "default")).limit(1),
    ]);
    return Response.json({ records, settings: savedSettings[0] ?? defaultSettings }, { headers: jsonHeaders });
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
    if (!validSalaryAdjustments(payload)) {
      return Response.json({ error: "Invalid salary adjustments" }, { status: 400, headers: jsonHeaders });
    }

    const db = getDb();
    const savedSettings = await db.select().from(salarySettings).where(eq(salarySettings.id, "default")).limit(1);
    const { dailyRate, deductions, taxThreshold, taxRate } = savedSettings[0] ?? defaultSettings;
    const extraIncome = payload.extraIncome as number;
    const bonus = payload.bonus as number;
    const leaveDeduction = payload.leaveDeduction as number;
    const grossSalary = payload.workdays * dailyRate + extraIncome + bonus;
    const taxableIncome = Math.max(0, grossSalary - deductions - leaveDeduction - taxThreshold);
    const incomeTax = taxableIncome * taxRate / 100;
    const values = {
      month: payload.month,
      workdays: payload.workdays,
      dailyRate,
      deductions,
      taxThreshold,
      taxRate,
      extraIncome,
      bonus,
      leaveDeduction,
      grossSalary,
      taxableIncome,
      incomeTax,
      netSalary: grossSalary - deductions - leaveDeduction - incomeTax,
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

export async function PATCH(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const settingsValidity = validSalarySettings(payload);
    if (settingsValidity === "invalid") {
      return Response.json({ error: "Invalid salary settings" }, { status: 400, headers: jsonHeaders });
    }
    if (settingsValidity === "out-of-range") {
      return Response.json({ error: "Salary settings out of range" }, { status: 400, headers: jsonHeaders });
    }
    const values = {
      id: "default",
      dailyRate: payload.dailyRate as number,
      deductions: payload.deductions as number,
      taxThreshold: payload.taxThreshold as number,
      taxRate: payload.taxRate as number,
      updatedAt: new Date().toISOString(),
    };
    await getDb().insert(salarySettings).values(values).onConflictDoUpdate({
      target: salarySettings.id,
      set: values,
    });
    return Response.json({ settings: values }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Salary settings update failed" }, { status: 500, headers: jsonHeaders });
  }
}
