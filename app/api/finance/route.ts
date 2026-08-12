import { and, asc, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { financeTransactions } from "../../../db/schema";
import { summarizeLifeFinance } from "../../features/finance/domain";
import { importFinanceTransactions, toFinanceRecord, validNormalizedFinanceTransaction } from "../../features/finance/import-service";
import type { NormalizedFinanceTransaction } from "../../features/finance/types";
import { hasDashboardAccess } from "../access";

const jsonHeaders = { "Cache-Control": "no-store" };
const currentShanghaiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year") ?? currentShanghaiDate().slice(0, 4));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return Response.json({ error: "Invalid year" }, { status: 400, headers: jsonHeaders });
    const asOfDate = currentShanghaiDate();
    const rows = await getDb().select().from(financeTransactions).where(and(gte(financeTransactions.occurredAt, `${year}-01-01`), lte(financeTransactions.occurredAt, `${year}-12-31T23:59:59+08:00`))).orderBy(asc(financeTransactions.occurredAt));
    const records = rows.map(toFinanceRecord);
    return Response.json({ summary: summarizeLifeFinance(records, year, asOfDate), records: records.slice(-50).reverse() }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Finance records unavailable" }, { status: 500, headers: jsonHeaders });
  }
}

export async function POST(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ error: "Cloudflare Access login required" }, { status: 401, headers: jsonHeaders });
  try {
    const payload = await request.json() as { transactions?: unknown };
    if (!Array.isArray(payload.transactions) || payload.transactions.length === 0 || payload.transactions.length > 250 || !payload.transactions.every(validNormalizedFinanceTransaction)) {
      return Response.json({ error: "Invalid finance import batch" }, { status: 400, headers: jsonHeaders });
    }
    const report = await importFinanceTransactions(getDb(), payload.transactions as NormalizedFinanceTransaction[]);
    return Response.json({ report }, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Finance import failed" }, { status: 500, headers: jsonHeaders });
  }
}
