export function verifySameOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "DELETE") {
    return true;
  }

  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;

  let originHost = "";
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (
    originHost === "localhost" ||
    originHost === "127.0.0.1" ||
    originHost.endsWith(".pages.dev")
  ) {
    return true;
  }

  const candidates = new Set<string>();
  try {
    candidates.add(new URL(request.url).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  const h = request.headers.get("host")?.split(":")[0]?.trim().toLowerCase();
  const fh = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.split(":")[0]
    ?.trim()
    .toLowerCase();
  if (h) candidates.add(h);
  if (fh) candidates.add(fh);

  if (candidates.size === 0) return true;
  return candidates.has(originHost);
}
