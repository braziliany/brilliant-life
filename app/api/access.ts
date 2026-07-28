const DASHBOARD_HOST = "pulse.sophier.org";

export function hasDashboardAccess(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;

  return host === DASHBOARD_HOST && request.headers.has("Cf-Access-Jwt-Assertion");
}
