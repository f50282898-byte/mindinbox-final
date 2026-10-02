/**
 * Edge-safe Firebase ID token verification.
 *
 * Constraint: this module runs inside the Cloudflare Workers runtime.
 *  - Uses Web Crypto (`crypto.subtle`) only.
 *  - Uses Web `fetch` only.
 *  - No Node built-ins (crypto, fs, path, Buffer).
 *
 * The previous UI-only check (`uid === ... || true`) was a client-side
 * string comparison and granted console access to anyone. Authorisation is
 * now decided here, on the server, from the cryptographic signature of the
 * ID token plus the `admin: true` custom claim.
 */

const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** Firebase ID tokens live for 1 hour; verify with a small leeway. */
const CLOCK_LEEWAY_SECONDS = 60;

type KeyRecord = {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
};

interface CachedJwks {
  keys: KeyRecord[];
  fetchedAt: number;
}

const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache: CachedJwks | null = null;
let jwksInFlight: Promise<KeyRecord[]> | null = null;

async function loadKeys(): Promise<KeyRecord[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  if (jwksInFlight) return jwksInFlight;

  jwksInFlight = (async () => {
    const res = await fetch(GOOGLE_JWKS_URL, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: JWKS_TTL_MS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`JWKS fetch failed with ${res.status}`);
    const json = (await res.json()) as { keys?: KeyRecord[] };
    const keys = Array.isArray(json.keys) ? json.keys : [];
    jwksCache = { keys, fetchedAt: Date.now() };
    return keys;
  })();

  try {
    return await jwksInFlight;
  } finally {
    jwksInFlight = null;
  }
}

/** base64url -> ArrayBuffer. Works in Workers (atob) and Node 18+ (Buffer). */
function decodeBase64Url(segment: string): ArrayBuffer {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  if (typeof atob === "function") {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out.buffer;
  }
  // Node fallback (local builds only) — never reached on Workers.
  const globalBuffer = (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }).Buffer;
  if (!globalBuffer) throw new Error("No base64url decoder available");
  const bytes = new Uint8Array(globalBuffer.from(padded, "base64"));
  return bytes.buffer as ArrayBuffer;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  const bytes = decodeBase64Url(segment);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as Record<string, unknown>;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : (globalThis as { Buffer: { from(s: string, e: string): { toString(e: string): string } } })
          .Buffer.from(binary, "binary")
          .toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface VerifiedToken {
  uid: string;
  email: string | null;
  /** True only when the token carries a server-issued `admin: true` claim. */
  isAdmin: boolean;
  /** Tier claim, when a trusted provisioning process has stamped one. */
  tierClaim: string | null;
  issuedAt: number;
  expiresAt: number;
}

export type VerifyFailure =
  | "missing"
  | "malformed"
  | "unsupported_alg"
  | "unknown_key"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "not_yet_valid"
  | "jwks_unavailable";

export type VerifyResult =
  | { ok: true; token: VerifiedToken }
  | { ok: false; reason: VerifyFailure };

async function verifySignature(
  keyRecord: KeyRecord,
  signingInput: string,
  signature: ArrayBuffer
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: keyRecord.kty, alg: "RS256", n: keyRecord.n, e: keyRecord.e },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(signingInput)
  );
}

/**
 * Cryptographically verifies a Firebase ID token.
 *
 * @param idToken Raw `Authorization: Bearer <token>` value.
 * @param projectId Expected Firebase project; guards issuer AND audience.
 */
export async function verifyIdToken(
  idToken: string | null | undefined,
  projectId: string | undefined
): Promise<VerifyResult> {
  if (!idToken) return { ok: false, reason: "missing" };
  if (!projectId) return { ok: false, reason: "wrong_issuer" };

  const parts = idToken.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerSeg, payloadSeg, signatureSeg] = parts as [string, string, string];

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJsonSegment(headerSeg);
    claims = decodeJsonSegment(payloadSeg);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Pin the algorithm. Rejecting anything but RS256 blocks alg=none / HS256
  // key-confusion attacks.
  if (header.alg !== "RS256") return { ok: false, reason: "unsupported_alg" };

  const kid = typeof header.kid === "string" ? header.kid : null;
  if (!kid) return { ok: false, reason: "malformed" };

  let keys: KeyRecord[];
  try {
    keys = await loadKeys();
  } catch {
    return { ok: false, reason: "jwks_unavailable" };
  }
  const keyRecord = keys.find((k) => k.kid === kid);
  if (!keyRecord) {
    // Force a refetch once — Google rotates signing keys.
    jwksCache = null;
    try {
      keys = await loadKeys();
    } catch {
      return { ok: false, reason: "jwks_unavailable" };
    }
    if (!keys.find((k) => k.kid === kid)) return { ok: false, reason: "unknown_key" };
  }

  const resolvedKey = keys.find((k) => k.kid === kid)!;
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const signature = decodeBase64Url(signatureSeg);
  let signatureOk = false;
  try {
    signatureOk = await verifySignature(resolvedKey, signingInput, signature);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!signatureOk) return { ok: false, reason: "bad_signature" };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  const iat = typeof claims.iat === "number" ? claims.iat : 0;
  if (!exp || exp + CLOCK_LEEWAY_SECONDS < nowSeconds) return { ok: false, reason: "expired" };
  if (iat && iat - CLOCK_LEEWAY_SECONDS > nowSeconds) {
    return { ok: false, reason: "not_yet_valid" };
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (claims.iss !== expectedIssuer) return { ok: false, reason: "wrong_issuer" };
  if (claims.aud !== projectId) return { ok: false, reason: "wrong_audience" };
  if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, reason: "malformed" };

  const tierClaim =
    typeof claims.tier === "string"
      ? claims.tier
      : typeof claims.subscriptionTier === "string"
        ? (claims.subscriptionTier as string)
        : null;

  return {
    ok: true,
    token: {
      uid: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      // Only a cryptographically-verified claim counts. The client cannot forge this.
      isAdmin: claims.admin === true,
      tierClaim,
      issuedAt: iat * 1000,
      expiresAt: exp * 1000,
    },
  };
}

/** Extracts a bearer token from a Headers object (Web-standard, no Node http types). */
export function bearerFromHeaders(headers: Headers): string | null {
  const header = headers.get("authorization") ?? headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export { toBase64Url, decodeBase64Url };