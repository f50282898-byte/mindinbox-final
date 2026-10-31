/** Server-side allowance. The compare-and-swap commit checks and spends both counters atomically. */
import { adminConfigured, getAccessToken, serviceProjectId } from "@/lib/google/token";
export const FREE_INTERACTIONS = 5;
export const IP_DAILY_LIMIT = 30;
export const BURST_WINDOW_MS = 60_000;
export const BURST_MAX_REQUESTS = 8;
const bursts = new Map<string, number[]>();
const local = new Map<string, number>();
export type QuotaDecision = { allowed: true; remaining: number } |
  { allowed: false; code: "GATE"; remaining: 0; reason: "uid_exhausted" | "ip_exhausted" };
export class QuotaUnavailable extends Error { constructor() { super("quota_unavailable"); } }
export class QuotaExceeded extends Error { constructor() { super("quota_exhausted"); } }
export function checkBurst(uid: string | null, ip: string | null): boolean {
  const now = Date.now();
  for (const [key, hits] of bursts) if ((hits.at(-1) ?? 0) <= now - BURST_WINDOW_MS) bursts.delete(key);
  // A full isolate refuses new identities rather than evicting active limits.
  const keys = [uid ? `uid:${uid}` : "guest", ...(ip ? [`ip:${ip}`] : [])];
  if (bursts.size + keys.filter((key) => !bursts.has(key)).length > 10_000) return false;
  const histories = keys.map((key) => (bursts.get(key) ?? []).filter((at) => at > now - BURST_WINDOW_MS));
  if (histories.some((hits) => hits.length >= BURST_MAX_REQUESTS)) return false;
  keys.forEach((key, i) => bursts.set(key, [...histories[i], now]));
  return true;
}
function localMode(): boolean {
  if (adminConfigured()) return false;
  return true;
}
async function counterPaths(uid: string, ip: string | null, now: number): Promise<string[]> {
  if (!uid || uid.includes("/")) throw new QuotaUnavailable();
  const paths = [`usage/${uid}`];
  if (ip) {
    const salt = process.env.ANON_SESSION_SECRET ?? "";
    if (salt.length < 32) throw new QuotaUnavailable();
    const day = new Date(now).toISOString().slice(0, 10);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hash = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${day}:${ip}`));
    const hex = Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("").slice(0, 32);
    paths.push(`usage-ip/${day}-${hex}`);
  }
  return paths;
}
async function connection() {
  const token = await getAccessToken(); const project = serviceProjectId();
  if (!token || !project) throw new QuotaUnavailable();
  const root = `projects/${project}/databases/(default)/documents`;
  return { root, url: `https://firestore.googleapis.com/v1/${root}`, headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" } };
}
async function snapshot(c: Awaited<ReturnType<typeof connection>>, path: string) {
  const res = await fetch(`${c.url}/${path}`, { headers: c.headers, signal: AbortSignal.timeout(5000) });
  if (res.status === 404) return { count: 0, updateTime: null };
  if (!res.ok) throw new QuotaUnavailable();
  const doc = await res.json() as { fields?: { count?: { integerValue?: string } }; updateTime?: string };
  const count = Number(doc.fields?.count?.integerValue ?? 0);
  if (!Number.isSafeInteger(count) || count < 0 || !doc.updateTime) throw new QuotaUnavailable();
  return { count, updateTime: doc.updateTime };
}
function decision(counts: number[]): QuotaDecision {
  const index = counts.findIndex((n, i) => n >= (i === 0 ? FREE_INTERACTIONS : IP_DAILY_LIMIT));
  return index < 0 ? { allowed: true, remaining: FREE_INTERACTIONS - counts[0] } :
    { allowed: false, code: "GATE", remaining: 0, reason: index === 0 ? "uid_exhausted" : "ip_exhausted" };
}
export async function checkQuota(uid: string, ip: string | null, now = Date.now()): Promise<QuotaDecision> {
  const paths = await counterPaths(uid, ip, now);
  if (localMode()) return decision(paths.map((p) => local.get(p) ?? 0));
  const c = await connection();
  return decision((await Promise.all(paths.map((p) => snapshot(c, p)))).map((s) => s.count));
}
/** Called before delivering the first answer. Provider failure before this point costs nothing. */
export async function spendInteraction(uid: string, ip: string | null, now = Date.now()): Promise<number> {
  const paths = await counterPaths(uid, ip, now);
  if (localMode()) {
    const counts = paths.map((p) => local.get(p) ?? 0);
    if (!decision(counts).allowed) throw new QuotaExceeded();
    paths.forEach((p, i) => local.set(p, counts[i] + 1));
    return FREE_INTERACTIONS - counts[0] - 1;
  }
  const c = await connection();
  for (let attempt = 0; attempt < 5; attempt++) {
    const docs = await Promise.all(paths.map((p) => snapshot(c, p)));
    if (!decision(docs.map((d) => d.count)).allowed) throw new QuotaExceeded();
    const writes = paths.map((path, i) => ({
      update: { name: `${c.root}/${path}`, fields: { count: { integerValue: String(docs[i].count + 1) } } },
      updateMask: { fieldPaths: ["count"] },
      currentDocument: docs[i].updateTime ? { updateTime: docs[i].updateTime } : { exists: false },
    }));
    const res = await fetch(`${c.url}:commit`, { method: "POST", headers: c.headers,
      body: JSON.stringify({ writes }), signal: AbortSignal.timeout(5000) });
    if (res.ok) return FREE_INTERACTIONS - docs[0].count - 1;
    const error = await res.json().catch(() => null) as { error?: { status?: string } } | null;
    if (!["FAILED_PRECONDITION", "ABORTED", "ALREADY_EXISTS"].includes(error?.error?.status ?? "")) throw new QuotaUnavailable();
  }
  throw new QuotaUnavailable();
}
export function quotaStoreHealthy(_decision: QuotaDecision): boolean { return true; }
export function resetDevQuotaCounters(): void { local.clear(); bursts.clear(); }
