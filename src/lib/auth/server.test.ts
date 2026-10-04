import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { verifyIdToken, bearerFromHeaders, resetJwksCache } from "@/lib/auth/server";

/**
 * Firebase ID-token verification.
 *
 * Each test mints a real RS256 token with a locally generated key and serves
 * the matching JWKS through an injected key resolver. Nothing is stubbed: the
 * signature is genuinely produced and genuinely checked, so these tests would
 * catch a regression in algorithm pinning, issuer/audience enforcement, or
 * expiry handling.
 */

const PROJECT = "test-project-1234";
const OTHER_PROJECT = "attacker-project-9999";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

async function signJwt(
  claims: Record<string, unknown>,
  opts: { expiresIn?: string | number; issuedAt?: number; issuer?: string; audience?: string } = {}
): Promise<string> {
  // `exp` defaults to one hour out. It is a REQUIRED claim in the verifier, so
  // a token minted without one is correctly rejected — which is exactly what
  // the "rejects garbage" cases rely on.
  const expiresIn = opts.expiresIn ?? "1h";

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setSubject((claims.sub as string) ?? "uid-1")
    .setIssuer(opts.issuer ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.audience ?? PROJECT)
    .setIssuedAt(opts.issuedAt ?? Math.floor(Date.now() / 1000))
    .setExpirationTime(expiresIn as never)
    .sign(privateKey);
}

/** Resolves any `kid` to our single test public key. */
const localJwks: JWTVerifyGetKey = async () => publicKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

beforeEach(() => {
  resetJwksCache();
});

describe("verifyIdToken", () => {
  it("accepts a well-formed token for this project", async () => {
    const token = await signJwt({ sub: "uid-abc", email: "a@example.com", email_verified: true });
    const result = await verifyIdToken(token, PROJECT, { jwks: localJwks });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.uid).toBe("uid-abc");
    expect(result.user.email).toBe("a@example.com");
    expect(result.user.emailVerified).toBe(true);
  });

  it("rejects an expired token", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 7200;
    const token = await signJwt({ sub: "uid-abc" }, { issuedAt, expiresIn: issuedAt + 3600 });

    const result = await verifyIdToken(token, PROJECT, { jwks: localJwks });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("expired");
  });

  it("rejects a token whose audience is another project", async () => {
    const token = await signJwt({ sub: "uid-abc" }, { audience: OTHER_PROJECT });

    const result = await verifyIdToken(token, PROJECT, { jwks: localJwks });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("wrong_audience");
  });

  it("rejects a token whose issuer is another project", async () => {
    const token = await signJwt(
      { sub: "uid-abc" },
      { issuer: `https://securetoken.google.com/${OTHER_PROJECT}` }
    );

    const result = await verifyIdToken(token, PROJECT, { jwks: localJwks });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("wrong_issuer");
  });

  it("rejects a token signed by a different key", async () => {
    const other = await generateKeyPair("RS256", { extractable: true });
    const forged = await new SignJWT({ sub: "uid-abc" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(other.privateKey);

    const result = await verifyIdToken(forged, PROJECT, { jwks: localJwks });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["bad_signature", "unknown_key", "malformed"]).toContain(result.reason);
  });

  it("rejects an unsigned token (alg: none)", async () => {
    // Header/payload with no signature. jose refuses before any key lookup.
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      sub: "uid-abc",
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      iat: now,
      exp: now + 3600,
    })}.`;

    const result = await verifyIdToken(none, PROJECT, { jwks: localJwks });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing or blank token", async () => {
    expect(await verifyIdToken(null, PROJECT, { jwks: localJwks })).toEqual({
      ok: false,
      reason: "missing_token",
    });
    expect(await verifyIdToken("   ", PROJECT, { jwks: localJwks })).toEqual({
      ok: false,
      reason: "missing_token",
    });
  });

  it("rejects garbage", async () => {
    for (const bad of ["not-a-jwt", "a.b", "a.b.c.d", "...."]) {
      const result = await verifyIdToken(bad, PROJECT, { jwks: localJwks });
      expect(result.ok, bad).toBe(false);
    }
  });

  it("fails closed when the project id is unset", async () => {
    const previous = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    try {
      const token = await signJwt({ sub: "uid-abc" });
      const result = await verifyIdToken(token, undefined, { jwks: localJwks });
      expect(result).toEqual({ ok: false, reason: "config_missing" });
    } finally {
      if (previous !== undefined) process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = previous;
    }
  });

  it("does not treat a client-supplied admin claim as authoritative", async () => {
    // The claim is passed through verbatim in `claims`. Nothing in this module
    // reads it as an authorisation decision; `requireAdmin` checks the
    // `admins/{uid}` document instead. This test pins that separation.
    const token = await signJwt({ sub: "uid-abc", admin: true, tier: "sanctum" });
    const result = await verifyIdToken(token, PROJECT, { jwks: localJwks });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.claims.admin).toBe(true);
    // The verified identity exposes no `isAdmin` field at all, so no caller
    // can reach for it by accident.
    expect("isAdmin" in result.user).toBe(false);
  });
});

describe("bearerFromHeaders", () => {
  it("extracts the token, case-insensitively", () => {
    expect(bearerFromHeaders(new Headers({ authorization: "Bearer abc.def.ghi" }))).toBe(
      "abc.def.ghi"
    );
    expect(bearerFromHeaders(new Headers({ Authorization: "bearer   xyz " }))).toBe("xyz");
  });

  it("returns null for absent or malformed values", () => {
    expect(bearerFromHeaders(new Headers())).toBeNull();
    expect(bearerFromHeaders(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerFromHeaders(new Headers({ authorization: "Bearer" }))).toBeNull();
  });
});
