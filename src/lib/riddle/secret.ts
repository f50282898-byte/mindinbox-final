/**
 * The riddle signing secret.
 *
 * ## One secret, read from the edge environment
 *
 * `RIDDLE_SIGNING_SECRET` is never `NEXT_PUBLIC_` and never appears in the bundle —
 * `scripts/check-no-riddle-leak.mjs` scans for the name itself as well as the value,
 * so a future refactor that hoists it into a shared module fails the build.
 *
 * ## No secret means no game
 *
 * Returns `null` rather than a default. A hardcoded fallback would be a signing key
 * that is in the repository, which is the same as no signature at all — and it would
 * look like it worked. A missing secret fails closed: the roll route refuses, and the
 * redemption routes refuse.
 *
 * Falls back to `ANON_SESSION_SECRET` so a deployment that already has a suitable
 * secret does not need a second one. Reusing one secret for two purposes is worse
 * than two secrets, and is called out in `PROJECT_MAP.md` as a thing to split before
 * the deployment is public.
 */

export function riddleSigningSecret(): string | null {
  const secret = process.env.RIDDLE_SIGNING_SECRET ?? process.env.ANON_SESSION_SECRET;
  if (typeof secret !== "string" || secret.trim().length < 32) {
    // Shorter than an HMAC key should be. A 32-character floor is not a strong
    // entropy requirement — it rejects the mistakes (empty string, a placeholder,
    // a truncated paste) rather than pretending to measure strength.
    return null;
  }
  return secret;
}
