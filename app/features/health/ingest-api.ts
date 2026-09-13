import { type HealthPayload, isValidHealthApiKey } from "../../api/validation.ts";

const jsonHeaders = {
  "Cache-Control": "no-store",
};

export type HealthIngestDependencies = {
  configuredKey?: string;
  now?: () => Date;
  recordInvalidPayload: (receivedAt: string) => Promise<void>;
  ingest: (payload: HealthPayload, receivedAt: string) => Promise<Response>;
};

export async function handleHealthIngestPost(request: Request, dependencies: HealthIngestDependencies) {
  const suppliedKey = request.headers.get("X-API-Key");
  if (!isValidHealthApiKey(dependencies.configuredKey, suppliedKey)) {
    return Response.json({ error: "Invalid API key" }, { status: 401, headers: jsonHeaders });
  }

  const receivedAt = (dependencies.now?.() ?? new Date()).toISOString();
  let payload: HealthPayload;
  try {
    payload = (await request.json()) as HealthPayload;
  } catch {
    try {
      await dependencies.recordInvalidPayload(receivedAt);
    } catch {
      // Keep the public error stable even if ingestion diagnostics are unavailable.
    }
    return Response.json({ error: "Invalid JSON payload" }, { status: 400, headers: jsonHeaders });
  }

  try {
    return await dependencies.ingest(payload, receivedAt);
  } catch {
    return Response.json({ error: "Health data import failed" }, { status: 400, headers: jsonHeaders });
  }
}

export function healthIngestMethodNotAllowed() {
  return Response.json(
    { error: "Method not allowed" },
    { status: 405, headers: { ...jsonHeaders, Allow: "POST" } },
  );
}
