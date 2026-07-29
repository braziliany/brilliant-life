import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { workExperiences } from "../../../db/schema";
import { hasDashboardAccess } from "../access";

const jsonHeaders = { "Cache-Control": "no-store" };

function readExperience(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const company = typeof input.company === "string" ? input.company.trim().slice(0, 80) : "";
  const role = typeof input.role === "string" ? input.role.trim().slice(0, 80) : "";
  const startDate = typeof input.startDate === "string" ? input.startDate : "";
  const endDate = typeof input.endDate === "string" && input.endDate ? input.endDate : null;
  const summary = typeof input.summary === "string" ? input.summary.trim().slice(0, 300) : "";
  if (!company || !role || !/^\d{4}-\d{2}$/.test(startDate) || (endDate && !/^\d{4}-\d{2}$/.test(endDate))) return null;
  return { company, role, startDate, endDate, summary, updatedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const experiences = await getDb().select().from(workExperiences).orderBy(asc(workExperiences.sortOrder), asc(workExperiences.startDate));
    return Response.json({ experiences }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Work experience database unavailable" }, { status: 500, headers: jsonHeaders });
  }
}

export async function POST(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const values = readExperience(await request.json());
    if (!values) return Response.json({ error: "company, role and startDate are required" }, { status: 400, headers: jsonHeaders });
    const db = getDb();
    const [order] = await db.select({
      next: sql<number>`coalesce(max(${workExperiences.sortOrder}), -1) + 1`,
    }).from(workExperiences);
    const [experience] = await db.insert(workExperiences).values({ ...values, sortOrder: Number(order?.next ?? 0) }).returning();
    return Response.json({ experience }, { status: 201, headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Work experience creation failed" }, { status: 500, headers: jsonHeaders });
  }
}

export async function PATCH(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const payload = await request.json() as { ids?: unknown };
    if (!Array.isArray(payload.ids) || payload.ids.length > 100) {
      return Response.json({ error: "ids must be an array" }, { status: 400, headers: jsonHeaders });
    }
    const ids = payload.ids.map(Number);
    if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
      return Response.json({ error: "ids must contain unique positive integers" }, { status: 400, headers: jsonHeaders });
    }
    const db = getDb();
    const existing = await db.select({ id: workExperiences.id }).from(workExperiences);
    const existingIds = existing.map(({ id }) => id).sort((a, b) => a - b);
    const requestedIds = [...ids].sort((a, b) => a - b);
    if (existingIds.length !== requestedIds.length || existingIds.some((id, index) => id !== requestedIds[index])) {
      return Response.json({ error: "ids must include every work experience exactly once" }, { status: 400, headers: jsonHeaders });
    }
    const updatedAt = new Date().toISOString();
    for (const [sortOrder, id] of ids.entries()) {
      await db.update(workExperiences).set({ sortOrder, updatedAt }).where(eq(workExperiences.id, id));
    }
    return Response.json({ ids }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Work experience reorder failed" }, { status: 500, headers: jsonHeaders });
  }
}

export async function PUT(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const values = readExperience(payload);
    if (!Number.isInteger(id) || id < 1 || !values) return Response.json({ error: "valid id and experience fields are required" }, { status: 400, headers: jsonHeaders });
    const [experience] = await getDb().update(workExperiences).set(values).where(eq(workExperiences.id, id)).returning();
    if (!experience) return Response.json({ error: "Work experience not found" }, { status: 404, headers: jsonHeaders });
    return Response.json({ experience }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Work experience update failed" }, { status: 500, headers: jsonHeaders });
  }
}

export async function DELETE(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const payload = await request.json() as { id?: number };
    if (!Number.isInteger(payload.id) || Number(payload.id) < 1) return Response.json({ error: "valid id is required" }, { status: 400, headers: jsonHeaders });
    await getDb().delete(workExperiences).where(eq(workExperiences.id, payload.id!));
    return Response.json({ deleted: payload.id }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Work experience deletion failed" }, { status: 500, headers: jsonHeaders });
  }
}
