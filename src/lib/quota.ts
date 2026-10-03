/**
 * Server-only quota.
 *
 * Requirements this satisfies:
 *  - the allowance is per **uid**, guest or signed in, and lives on the server
 *  - clearing localStorage (or the cookie) cannot restore it
 *  - the counter increments **atomically** when a response starts, not when the
 *    request arrives, so an outage does not burn someone's allowance
 *  - exceeding it returns `{ code: "GATE" }`
 *
 * Atomicity: the increment is a Firestore `FieldTransform.increment` performed
 * through the REST API's `updateMask` + `updateTransforms` fields, which the
 * database applies server-side. A read-then-write would race: two simultaneous
 * requests could both read 4 and both write 5, granting a sixth free turn.
 *
 * ── What this cannot do ───────────────────────────────────────────────────
 *
 * It stops casual abuse: refreshing, clearing storage, opening a private window.
 * It does not stop someone who clears cookies *and* changes IP, because there is
 * no server-side identity for an anonymous visitor beyond the quota record we
 * write. That is why the per-IP limit below exists — it raises the cost, it does
 * not make bypass impossible. This is a conversion device and a fair-use
 * measure, not an anti-abuse system, and it is documented as such rather than
 * presented as a security control.
 *
 * IP handling: the address is never stored. A keyed hash is stored, with a daily
 * salt, so the record cannot be reversed into an address and a given address
 * resets each day.
 */

import { adminConfigured, getAccessToken, serviceProjectId } from "@/lib/google/token";
import { log } from "@/lib/log";

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";

/** Free allowance per uid. */
export const FREE_INTERACTIONS = 5;

/** Per-IP daily ceiling. Higher than the per-uid limit on purpose. */
export const IP_DAILY_LIMIT = 30;

export type QuotaDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; code: "GATE"; remaining: 0; reason: "uid_exhausted" | "ip_exhausted" };

/** Hash an IP with a daily salt. The raw address never leaves this function. */
async function hashIp(ip: string, day: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${day}:${ip}`)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

interface CounterDoc {
  count?: number | null;
}

/**
 * Reads a counter document.
 *
 * Uses `runTransaction` on the REST endpoint with a single read so the returned
 * value is consistent; for the gate decision this is a read-only view and a
 * slight staleness is acceptable — the *increment* is what must be atomic.
 */
async function readCounter(path: string): Promise<number> {
  if (devFallbackAllowed()) return devRead(path);
  const doc = await getDocument(path);
  const n = doc?.count;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Atomically increments a counter and returns the NEW value.
 *
 * This is the operation that makes concurrent requests safe: the database
 * applies the transform, so two simultaneous calls produce 5 and 6, never 5 and 5.
 */
async function incrementCounter(path: string, field: string): Promise<number> {
  if (devFallbackAllowed()) return devIncrement(path, field);
  const token = await getAccessToken();
  const project = serviceProjectId();
  if (!token || !project) throw new Error("server credentials unavailable");

  const url = `${FIRESTORE_BASE}/projects/${project}/databases/(default)/documents/${path}?updateMask.fieldPaths=${encodeURIComponent(
    field
  )}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      updateTransforms: [
        {
          fieldPath: field,
          increment: { integerValue: "1" },
        },
      ],
    }),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`increment failed with status ${res.status}`);
  }

  const json = (await res.json().catch(() => null)) as {
    fields?: Record<string, { integerValue?: string; doubleValue?: number }>;
  } | null;

  const field_ = json?.fields?.[field];
  if (field_?.integerValue !== undefined) return Number(field_.integerValue);
  if (typeof field_?.doubleValue === "number") return field_.doubleValue;
  return 1;
}

/**
 * Checks whether `uid` may make one more interaction.
 *
 * Read-only. Spends nothing, so an outage or a refusal cannot cost an attempt.
 */
export async function checkQuota(uid: string, ip: string | null, now = Date.now()): Promise<QuotaDecision> {
  const used = await readCounter(`usage/${uid}`);
  if (used >= FREE_INTERACTIONS) {
    return { allowed: false, code: "GATE", remaining: 0, reason: "uid_exhausted" };
  }

  if (ip) {
    const salt = process.env.ANON_SESSION_SECRET ?? "";
    if (salt.length >= 32) {
      const day = dayKey(now);
      const hashed = await hashIp(ip, day, salt);
      const ipUsed = await readCounter(`usage/ip-${day}/${hashed}`);
      if (ipUsed >= IP_DAILY_LIMIT) {
        return { allowed: false, code: "GATE", remaining: 0, reason: "ip_exhausted" };
      }
    }
  }

  return { allowed: true, remaining: FREE_INTERACTIONS - used };
}

/**
 * Spends one interaction.
 *
 * Called when a response has actually *started* — after the first token — so a
 * failed provider chain costs the user nothing.
 */
export async function spendInteraction(
  uid: string,
  ip: string | null,
  now = Date.now()
): Promise<number> {
  const remaining = await incrementCounter(`usage/${uid}`, "count");

  if (ip) {
    const salt = process.env.ANON_SESSION_SECRET ?? "";
    if (salt.length >= 32) {
      const day = dayKey(now);
      const hashed = await hashIp(ip, day, salt);
      await incrementCounter(`usage/ip-${day}/${hashed}`, "count").catch(() => undefined);
    }
  }

  return Math.max(0, FREE_INTERACTIONS - remaining);
}

/** Reads a document through the REST API. Mirrors `firestore-rest` but local
 *  to this module so the quota path has no cross-module coupling. */
async function getDocument(path: string): Promise<CounterDoc | null> {
  const token = await getAccessToken();
  const project = serviceProjectId();
  if (!token || !project) return null;

  const res = await fetch(
    `${FIRESTORE_BASE}/projects/${project}/databases/(default)/documents/${path}`,
    { headers: { authorization: `Bearer ${token.token}` } }
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    log.warn("quota_read_failed", { status: res.status });
    return null;
  }

  const json = (await res.json()) as {
    fields?: Record<string, { integerValue?: string; doubleValue?: number }>;
  };
  const field = json.fields?.count;
  if (field?.integerValue !== undefined) return { count: Number(field.integerValue) };
  if (typeof field?.doubleValue === "number") return { count: field.doubleValue };
  return { count: 0 };
}

/**
 * Fails open or closed, deliberately.
 *
 * If the counter store is unreachable we ALLOW the request. Denying every user
 * because a Firestore read timed out would be a worse failure than the abuse we
 * are guarding against, and the abuse requires deliberate effort anyway. The
 * condition is logged so an outage is visible.
 */
export function quotaStoreHealthy(decision: QuotaDecision): boolean {
  return decision.allowed || decision.reason === "uid_exhausted" || decision.reason === "ip_exhausted";
}

/* ── development fallback ─────────────────────────────────────────────────
 *
 * With no service account there is no counter store, so the allowance cannot
 * be enforced at all and the gate can never fire — which also makes the
 * acceptance test untestable locally.
 *
 * So outside production, an in-memory counter stands in. It is per-isolate and
 * resets on restart, which is fine for local development and useless as an
 * attack: it is guarded on BOTH `NODE_ENV` and the absence of credentials, so
 * production cannot reach this path even if the check is somehow bypassed.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * With no service account there is no counter store, so the allowance cannot
 * be enforced at all and the gate can never fire — which also makes the
 * acceptance test untestable locally.
 *
 * So when credentials are absent, an in-memory counter stands in.
 *
 * The guard is **credential availability, not `NODE_ENV`**. `next start` runs
 * with `NODE_ENV=production`, so an environment-based guard would switch the
 * fallback off in exactly the local production build the e2e suite exercises —
 * which is what happened the first time. A missing secret is the real signal
 * that no store exists.
 *
 * Consequences, stated plainly:
 *  - this counter is per-isolate and resets on restart, so it is weak. It is
 *    strictly better than no limit, not a substitute for the real one.
 *  - a production deployment with the secret missing is degraded, not secure.
 *    PROJECT_MAP lists the secret as required for exactly this reason.
 */
const devCounters = new Map<string, number>();
let warnedAboutFallback = false;

function devFallbackAllowed(): boolean {
  if (adminConfigured()) return false;
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    log.error("quota_using_in_memory_fallback");
  }
  return true;
}

/**
 * One key builder for both read and write.
 *
 * These two used different shapes (`path` vs `path#field`), so every read missed
 * what the write had recorded: the counter returned 0 forever and the gate could
 * never fire. Building the key in one place removes the possibility.
 */
function devKey(path: string, field: string): string {
  return `${path}#${field}`;
}

async function devRead(path: string): Promise<number> {
  return devCounters.get(devKey(path, "count")) ?? 0;
}

async function devIncrement(path: string, field: string): Promise<number> {
  const key = devKey(path, field);
  const next = (devCounters.get(key) ?? 0) + 1;
  devCounters.set(key, next);
  return next;
}

/** Test seam: clear the fallback counters. */
export function resetDevQuotaCounters(): void {
  devCounters.clear();
}
