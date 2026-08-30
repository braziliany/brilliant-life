const DASHBOARD_HOST = "pulse.sophier.org";
const DASHBOARD_ORIGIN = `https://${DASHBOARD_HOST}`;

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

export function isLocalDevelopmentHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0" || normalized === "::1" || isPrivateIpv4(normalized);
}

export function hasDashboardAccess(request: Request) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (isLocalDevelopmentHost(host)) return true;

  return host === DASHBOARD_HOST && request.headers.has("Cf-Access-Jwt-Assertion");
}

export function hasDashboardMutationOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  if (requestUrl.hostname.toLowerCase() === DASHBOARD_HOST) return origin === DASHBOARD_ORIGIN;
  if (!isLocalDevelopmentHost(requestUrl.hostname)) return false;
  try {
    return new URL(origin).origin === requestUrl.origin && isLocalDevelopmentHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}
