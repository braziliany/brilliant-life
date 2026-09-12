import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { salaryRecords } from "../../../db/schema";
import { handleSalaryRecordMutation } from "../../features/salary/write-service";
import { hasDashboardAccess, hasDashboardMutationOrigin } from "../access";
import { isCurrentSalaryMonth } from "../validation";
import { SALARY_POLICY } from "./policy";

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
  if (!hasDashboardMutationOrigin(request)) {
    return Response.json({ error: "Salary update origin not allowed" }, { status: 403, headers: jsonHeaders });
  }
  const clone = request.clone();
  let payload: unknown;
  try {
    payload = await clone.json();
  } catch {
    payload = null;
  }
  const isQuickCurrentSave = Boolean(
    payload && typeof payload === "object" && !Array.isArray(payload) &&
    Object.keys(payload).length === 2 && isCurrentSalaryMonth((payload as Record<string, unknown>).month),
  );
  return handleSalaryRecordMutation(request, getDb(), "update", isQuickCurrentSave ? SALARY_POLICY : undefined);
}

export async function POST(request: Request) {
  if (!hasDashboardAccess(request)) {
    return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  }
  if (!hasDashboardMutationOrigin(request)) {
    return Response.json({ error: "Salary update origin not allowed" }, { status: 403, headers: jsonHeaders });
  }
  return handleSalaryRecordMutation(request, getDb(), "create");
}
