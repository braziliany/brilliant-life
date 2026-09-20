import { env } from "cloudflare:workers";
import {
  handleQianJiBaselineMaintenance,
  qianJiBaselineMaintenanceMethodNotAllowed,
} from "../../../features/finance/qianji-baseline-maintenance";
import type { BaselineD1Database } from "../../../../../scripts/qianji-baseline-rebuild";

type MaintenanceEnv = {
  DB?: BaselineD1Database;
  QIANJI_BASELINE_MAINTENANCE_KEY?: string;
  QIANJI_BASELINE_DATABASE_ID?: string;
};

export function POST(request: Request) {
  const runtime = env as unknown as MaintenanceEnv;
  return handleQianJiBaselineMaintenance(request, {
    database: runtime.DB,
    maintenanceKey: runtime.QIANJI_BASELINE_MAINTENANCE_KEY,
    databaseId: runtime.QIANJI_BASELINE_DATABASE_ID,
  });
}

export const GET = qianJiBaselineMaintenanceMethodNotAllowed;
export const PUT = qianJiBaselineMaintenanceMethodNotAllowed;
export const PATCH = qianJiBaselineMaintenanceMethodNotAllowed;
export const DELETE = qianJiBaselineMaintenanceMethodNotAllowed;
