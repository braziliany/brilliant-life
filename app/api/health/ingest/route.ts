import { healthIngestMethodNotAllowed } from "../../../features/health/ingest-api";
import { handleHealthIngest } from "../ingest-handler";

export const POST = handleHealthIngest;
export const GET = healthIngestMethodNotAllowed;
export const PUT = healthIngestMethodNotAllowed;
export const PATCH = healthIngestMethodNotAllowed;
export const DELETE = healthIngestMethodNotAllowed;
