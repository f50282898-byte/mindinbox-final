/** Compare complete origins. Forwarded headers and sibling preview sites are not trusted. */
export function verifySameOrigin(request: Request): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}
