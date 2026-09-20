import {
  QIANJI_BASELINE_REBUILD_CONTRACT,
  runQianJiBaselineRebuild,
  validateQianJiBaselineExecutionAsset,
  type BaselineD1Database,
  type QianJiBaselineContract,
} from "../../../scripts/qianji-baseline-rebuild.ts";

const jsonHeaders = { "Cache-Control": "no-store" };
const productionHost = "pulse.sophier.org";
export const QIANJI_BASELINE_CONFIRMATION = "rebuild-qianji-2026-01-01-through-2026-08-31";
const SOURCE_COUNTS_SQL = `SELECT COUNT(*) AS total,
  SUM(CASE WHEN source = ? THEN 1 ELSE 0 END) AS qianji
FROM finance_transactions`;

export type QianJiBaselineMaintenanceDependencies = {
  database?: BaselineD1Database;
  maintenanceKey?: string;
  databaseId?: string;
  contract?: QianJiBaselineContract;
  now?: () => string;
};

function safeEqual(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

const reject = (error: string, status: number) => Response.json({ error }, { status, headers: jsonHeaders });

export function qianJiBaselineMaintenanceMethodNotAllowed() {
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...jsonHeaders, Allow: "POST" } });
}

export async function handleQianJiBaselineMaintenance(request: Request, dependencies: QianJiBaselineMaintenanceDependencies) {
  const contract = dependencies.contract ?? QIANJI_BASELINE_REBUILD_CONTRACT;
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== productionHost || !request.headers.has("Cf-Access-Jwt-Assertion")) return reject("Maintenance Access required", 403);
  if (!safeEqual(request.headers.get("X-Maintenance-Key"), dependencies.maintenanceKey)) return reject("Invalid maintenance key", 401);
  if (request.headers.get("X-Maintenance-Confirm") !== QIANJI_BASELINE_CONFIRMATION) return reject("Maintenance confirmation required", 400);
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return reject("Content-Type must be application/json", 415);
  if (!dependencies.database || dependencies.databaseId !== contract.databaseId) return reject("Maintenance runtime unavailable", 503);

  let body: unknown;
  try { body = await request.json(); }
  catch { return reject("Invalid maintenance payload", 400); }

  let canonical: ReturnType<typeof validateQianJiBaselineExecutionAsset>;
  try { canonical = validateQianJiBaselineExecutionAsset(body, contract); }
  catch { return reject("Canonical execution asset rejected", 400); }

  try {
    const countsResult = await dependencies.database.prepare(SOURCE_COUNTS_SQL).bind(contract.source).all<{ total: number | string; qianji: number | string | null }>();
    const counts = countsResult.results?.[0];
    const total = Number(counts?.total ?? -1);
    const qianji = Number(counts?.qianji ?? -1);
    if (total !== contract.productionRows || qianji !== contract.productionRows || total - qianji !== 0) return reject("Production baseline precondition changed", 409);

    const result = await runQianJiBaselineRebuild({
      database: dependencies.database,
      canonical: canonical.transactions,
      interlocks: { apply: true, target: "production", confirm: true },
      contract,
      now: dependencies.now,
    });
    if (result.mode !== "APPLIED" || !result.wrote) return reject("Baseline execution failed", 500);
    return Response.json({
      status: "qianji_canonical_baseline_established",
      deletedRows: result.deleteCount,
      insertedRows: result.insertCount,
      sourceIdSetHash: result.after?.sourceIdSetHash,
      timestamp: result.timestamp,
    }, { status: 200, headers: jsonHeaders });
  } catch {
    return reject("Baseline execution failed", 500);
  }
}

export const QIANJI_BASELINE_MAINTENANCE_SQL = { sourceCounts: SOURCE_COUNTS_SQL };
