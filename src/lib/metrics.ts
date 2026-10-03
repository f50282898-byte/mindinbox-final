/**
 * Usage metrics.
 *
 * Writes `metrics/{day}` aggregates. **No conversation text, ever** — only
 * counts, provider ids, latencies and token totals. The privacy policy promises
 * that journal and chat content is not logged, and this module is where that
 * promise is kept.
 *
 * Aggregates are written server-side with an atomic increment so concurrent
 * requests accumulate rather than overwrite.
 */

import { getAccessToken, serviceProjectId } from "@/lib/google/token";

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";

export type AiRoleName = "chat" | "analysis" | "admin";

export interface UsageRecord {
  /** Which chain answered. */
  provider: string;
  model: string;
  role: AiRoleName;
  promptTokens: number | null;
  completionTokens: number | null;
  /** End-to-end time to first token, ms. */
  latencyMs: number;
  /** Providers tried before the winner, e.g. ["gemini","groq"]. */
  attempted: string[];
  ok: boolean;
  /** Present when `ok` is false. */
  failure?: string;
  /** True when the wellbeing guard answered instead of a model. */
  wellbeing?: boolean;
  /** True when user text matched an injection pattern. Never the text itself. */
  injectionFiltered?: boolean;
}

/**
 * Records one interaction into the daily aggregate.
 *
 * Fire-and-forget by contract: metrics must never delay or fail a response, so
 * every error is swallowed after the token is spent.
 */
export async function recordUsage(record: UsageRecord, now = Date.now()): Promise<void> {
  try {
    const token = await getAccessToken();
    const project = serviceProjectId();
    if (!token || !project) return;

    const day = new Date(now).toISOString().slice(0, 10);
    const path = `metrics/${day}`;
    const providerKey = safeKey(record.provider);
    const roleKey = safeKey(record.role);

    await fetch(
      `${FIRESTORE_BASE}/projects/${project}/databases/(default)/documents/${path}?updateMask.fieldPaths=requests` +
        `&updateMask.fieldPaths=byProvider.${providerKey}` +
        `&updateMask.fieldPaths=byRole.${roleKey}` +
        `&updateMask.fieldPaths=failures` +
        `&updateMask.fieldPaths=wellbeing` +
        `&updateMask.fieldPaths=injectionFiltered` +
        (record.ok ? "" : `&updateMask.fieldPaths=failures.${safeKey(record.failure ?? "unknown")}`),
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          updateTransforms: [
            { fieldPath: "requests", increment: { integerValue: "1" } },
            { fieldPath: `byProvider.${providerKey}`, increment: { integerValue: "1" } },
            { fieldPath: `byRole.${roleKey}`, increment: { integerValue: "1" } },
            { fieldPath: "latencyMsTotal", increment: { integerValue: String(Math.round(record.latencyMs)) } },
            {
              fieldPath: "promptTokensTotal",
              increment: { integerValue: String(record.promptTokens ?? 0) },
            },
            {
              fieldPath: "completionTokensTotal",
              increment: { integerValue: String(record.completionTokens ?? 0) },
            },
            ...(record.ok
              ? []
              : [
                  { fieldPath: "failures", increment: { integerValue: "1" } },
                  {
                    fieldPath: `failures.${safeKey(record.failure ?? "unknown")}`,
                    increment: { integerValue: "1" },
                  },
                ]),
            ...(record.wellbeing
              ? [{ fieldPath: "wellbeing", increment: { integerValue: "1" } }]
              : []),
            ...(record.injectionFiltered
              ? [{ fieldPath: "injectionFiltered", increment: { integerValue: "1" } }]
              : []),
          ],
        }),
      }
    );
  } catch {
    // Swallowed on purpose: telemetry must not break the product.
  }
}

/**
 * Firestore field paths cannot contain `.`, `/`, `` ` ``, `[`, `]` or exceed
 * 1500 bytes. A provider id or failure code is external-ish input, so it is
 * normalised rather than trusted.
 */
function safeKey(raw: string): string {
  return raw.replace(/[.\/[\]`#]/g, "_").slice(0, 80) || "unknown";
}
