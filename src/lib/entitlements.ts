/**
 * Entitlements — the single answer to "what may this uid actually use?".
 *
 * Reads, in order of authority:
 *   1. `subscriptions/{uid}` — the billing record. Written by the server only.
 *   2. `grants`              — server-issued comps and promotions.
 *   3. the free trial window  — on `users/{uid}.trialEnd`.
 *   4. `admins/{uid}`        — admins hold the top tier implicitly.
 *
 * The result is derived, never stored, so there is no second copy to drift.
 * Critically, **no client-supplied value participates**: the caller passes only
 * a uid that the server itself obtained from a verified ID token.
 *
 * Prompt 11 replaces the static table with real payment webhooks that write
 * `subscriptions`. Nothing else in the codebase needs to change, because they
 * already ask this function rather than reading tiers directly.
 */

import type { Tier, TierEntitlements } from "@/lib/tiers";
import { TIER_DEFINITIONS, TIER_ORDER } from "@/lib/tiers";
import { getDocument, listDocuments } from "@/lib/google/firestore-rest";

export interface Grant {
  /** Which tier the grant confers. */
  tier: Tier;
  /** Epoch ms after which the grant stops counting. `null` = no expiry. */
  expiresAt: number | null;
}

export interface Entitlements extends TierEntitlements {
  uid: string;
  tier: Tier;
  /** Epoch ms, or `null` when nothing expires. */
  expiresAt: number | null;
  /** True while a free trial window is running. */
  trialActive: boolean;
  /** Days left in the trial, floored at 1 so "1 يوم" never renders as 0. */
  trialDaysLeft: number;
  /** Where the tier came from, for support and debugging. */
  source: "subscription" | "grant" | "trial" | "admin" | "default";
}

function maxTier(a: Tier, b: Tier): Tier {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

function atExpiry(tier: Tier, expiresAt: unknown): number | null {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return expiresAt;
}

/**
 * Normalises anything Firestore or an untrusted document might contain into a
 * `Tier`. Unknown values fall back to `"free"` — never to something higher.
 */
function asTier(value: unknown): Tier | null {
  return value === "free" || value === "oracle" || value === "sanctum" ? value : null;
}

function timestampToMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  // Firestore Timestamp via the client SDK shape.
  if (value && typeof value === "object" && "toMillis" in value) {
    const t = (value as { toMillis?: () => number }).toMillis?.();
    return typeof t === "number" ? t : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Reads the server's billing record. Returns `null` when absent, so the caller
 * falls through to grants and the trial.
 */
async function readSubscription(uid: string): Promise<{ tier: Tier; expiresAt: number | null } | null> {
  const doc = await getDocument<Record<string, unknown>>(`subscriptions/${uid}`);
  if (!doc) return null;

  const status = typeof doc.status === "string" ? doc.status : null;
  // Anything not explicitly active is treated as inactive.
  if (status !== "active") return null;

  const tier = asTier(doc.tier);
  if (!tier) return null;

  return { tier, expiresAt: atExpiry(tier, timestampToMs(doc.currentPeriodEnd)) };
}

/** Grants are documents named after the uid they were issued to. */
async function readGrants(uid: string, now: number): Promise<Grant[]> {
  let docs: Array<{ name: string; data: Record<string, unknown> }>;
  try {
    docs = await listDocuments("grants", 5);
  } catch {
    return [];
  }

  const out: Grant[] = [];
  for (const doc of docs) {
    // Prefer an indexed uid field; fall back to the document id convention.
    const owner = typeof doc.data.uid === "string" ? doc.data.uid : doc.name === uid ? uid : null;
    if (owner !== uid) continue;

    const tier = asTier(doc.data.tier);
    if (!tier) continue;

    const expiresAt = timestampToMs(doc.data.expiresAt);
    if (expiresAt !== null && expiresAt <= now) continue;

    out.push({ tier, expiresAt });
  }
  return out;
}

function trialState(trialEnd: number | null, now: number): { active: boolean; daysLeft: number } {
  if (trialEnd === null || trialEnd <= now) return { active: false, daysLeft: 0 };
  return { active: true, daysLeft: Math.max(1, Math.ceil((trialEnd - now) / 86_400_000)) };
}

/**
 * Resolves what `uid` is entitled to.
 *
 * Throws only when the server has no credentials at all; individual read
 * failures degrade to "less entitlement", never to "more".
 */
export async function getEntitlements(uid: string, now: number = Date.now()): Promise<Entitlements> {
  const [isAdmin, subscription, grants, profile] = await Promise.all([
    getDocument(`admins/${uid}`).then(
      (d) => d !== null,
      () => false
    ),
    readSubscription(uid).catch(() => null),
    readGrants(uid, now),
    getDocument<Record<string, unknown>>(`users/${uid}`).catch(() => null),
  ]);

  let tier: Tier = "free";
  let expiresAt: number | null = null;
  let source: Entitlements["source"] = "default";

  if (subscription) {
    tier = subscription.tier;
    expiresAt = subscription.expiresAt;
    source = "subscription";
  }

  for (const grant of grants) {
    const better = maxTier(tier, grant.tier);
    if (better !== tier) {
      tier = better;
      expiresAt = grant.expiresAt;
      source = "grant";
    }
  }

  const trial = trialState(timestampToMs(profile?.trialEnd ?? null), now);
  if (!subscription && trial.active) {
    // A trial never raises the tier; it only carries its own flag. Grants and
    // subscriptions are what actually confer access.
    source = tier === "free" && !grants.length ? "trial" : source;
  }

  if (isAdmin) {
    tier = "sanctum";
    expiresAt = null;
    source = "admin";
  }

  const definition = TIER_DEFINITIONS[tier];

  return {
    uid,
    tier,
    expiresAt,
    trialActive: trial.active,
    trialDaysLeft: trial.daysLeft,
    source,
    aiAttempts: definition.aiAttempts,
    trackerEntries: definition.trackerEntries,
    dailyAnalysis: definition.dailyAnalysis,
    pdfLibrary: definition.pdfLibrary,
    masterclasses: definition.masterclasses,
    community: definition.community,
    deepAnalysis: definition.deepAnalysis,
  };
}
