/**
 * Google OAuth access tokens for a service account, minted on the Edge.
 *
 * Purpose: the server needs *admin* Firestore access — writing `subscriptions`,
 * `usage`, `grants`, `metrics`, and deleting a user's documents on account
 * removal. The browser Client SDK cannot do that, and `firebase-admin` is
 * unavailable because it depends on Node built-ins.
 *
 * So we mint the access token ourselves: sign a JWT with the service account's
 * RS256 private key via `jose` (which uses Web Crypto), exchange it at Google's
 * token endpoint, and call Firestore's REST API with the result. No SDK.
 *
 * Secrets come from the environment only and are never logged, never returned
 * to a client, and never referenced with a `NEXT_PUBLIC_` prefix.
 */

import { SignJWT, importPKCS8 } from "jose";
import { log } from "@/lib/log";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firestore";
/** Hard ceiling on our own cache, independent of what Google says. */
const MAX_CACHE_MS = 45 * 60 * 1000;
/** Refresh this long before expiry, so an in-flight request never races it. */
const EXPIRY_LEEWAY_MS = 60 * 1000;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface AccessToken {
  token: string;
  /** Epoch ms at which the token stops being usable. */
  expiresAt: number;
}

let cache: AccessToken | null = null;
/** De-duplicates concurrent refreshes; a burst must not burn the quota. */
let inFlight: Promise<AccessToken> | null = null;

/** Test seam. */
export function resetTokenCache(): void {
  cache = null;
  inFlight = null;
}

/**
 * Reads and validates the service account JSON.
 *
 * The private key is kept in a closure and never logged. Only the parse is
 * validated here; signing failures are reported without echoing key material.
 */
function serviceAccountFromEnv(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error("service_account_parse_failed");
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const sa = parsed as Record<string, unknown>;

  const clientEmail = sa.client_email;
  const privateKey = sa.private_key;
  const projectId = sa.project_id;

  if (typeof clientEmail !== "string" || !clientEmail.includes("@")) {
    log.error("service_account_missing_client_email");
    return null;
  }
  if (typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) {
    log.error("service_account_missing_private_key");
    return null;
  }

  const out: ServiceAccount = {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: typeof projectId === "string" && projectId ? projectId : "",
  };
  return out;
}

async function mint(sa: ServiceAccount): Promise<AccessToken> {
  const key = await importPKCS8(sa.private_key, "RS256");

  const assertion = await new SignJWT({
    scope: SCOPE,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    // Status only. The body can echo the assertion, which is a credential.
    log.error("token_exchange_failed", { status: res.status });
    throw new Error(`token exchange failed with status ${res.status}`);
  }

  const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof json.access_token !== "string" || !json.access_token) {
    log.error("token_exchange_missing_access_token");
    throw new Error("token exchange returned no access_token");
  }

  const expiresInMs =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
      ? json.expires_in * 1000
      : 3600 * 1000;

  return {
    token: json.access_token,
    expiresAt: Date.now() + Math.min(expiresInMs, MAX_CACHE_MS),
  };
}

/**
 * Returns a cached access token, refreshing when it is close to expiry.
 *
 * Returns `null` when no service account is configured — callers must treat
 * that as "admin path unavailable", never as "allowed".
 */
export async function getAccessToken(): Promise<AccessToken | null> {
  const now = Date.now();

  if (cache && cache.expiresAt - EXPIRY_LEEWAY_MS > now) return cache;

  const sa = serviceAccountFromEnv();
  if (!sa) return null;

  if (inFlight) return inFlight;

  inFlight = mint(sa)
    .then((token) => {
      cache = token;
      return token;
    })
    .catch((err) => {
      // Drop the cache so the next call retries rather than serving nothing.
      cache = null;
      log.error("access_token_error", { message: err instanceof Error ? err.message : "unknown" });
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** The project the service account belongs to, or the configured one. */
export function serviceProjectId(): string | null {
  const sa = serviceAccountFromEnv();
  if (sa?.project_id) return sa.project_id;
  const id = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return id && id.trim() ? id.trim() : null;
}

/** True when the server has the credentials it needs for privileged writes. */
export function adminConfigured(): boolean {
  return serviceAccountFromEnv() !== null;
}
