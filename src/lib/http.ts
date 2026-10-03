/**
 * Small request helpers shared by the API routes.
 *
 * Extracted so the client-IP rule exists once. It decides the per-IP quota
 * ceiling, so two copies that drift would mean two different people being
 * counted against two different limits.
 */

/**
 * The caller's IP, or null when it cannot be trusted.
 *
 * Only the headers Cloudflare and a reverse proxy set are read. `null` means the
 * request came from somewhere we cannot attribute, and the per-IP ceiling simply
 * does not apply to it — the per-uid allowance is unaffected either way.
 */
export function clientIp(headers: Headers): string | null {
  const ip = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
  return ip && /^[\d.:a-f]{3,45}$/i.test(ip) ? ip : null;
}
