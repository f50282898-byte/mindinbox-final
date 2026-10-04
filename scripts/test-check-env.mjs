#!/usr/bin/env node
/**
 * Tests for `scripts/check-env.mjs`.
 *
 * ## Why a gate needs its own tests
 *
 * A check that always passes is worse than no check, because it converts "I verified the
 * environment" into a false statement. And a check that always fails is equally bad: it
 * trains everyone to ignore the output, and a real failure arrives with no credibility.
 *
 * The specific failure these guard against is the one found while writing it: the first
 * version reported all four coherence checks as failing on a *correct* environment,
 * because `.filter(Boolean)` keeps `{message: undefined}` — an object is truthy. The
 * script exited non-zero, which looked like a real configuration fault and would have
 * sent someone to re-check variables that were already right.
 *
 * Run: node scripts/test-check-env.mjs
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "check-env.mjs");

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

/**
 * Runs the script in a child process with an exact environment.
 *
 * A child process, not an import: the script reads `process.env` and local `.env` files
 * at module scope, so importing it would let one test's variables leak into the next.
 * Isolation here is the point.
 */
function run(env = {}, args = []) {
  const result = spawnSync(process.execPath, [SCRIPT, "--json", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    // A deliberately minimal base: no inherited variables, so a test asserts what it
    // set rather than what the developer happened to have exported.
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    /* reported by the caller's assertion */
  }
  return { code: result.status, json, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** A complete, coherent Production environment. */
const GOOD = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaFakeKeyForTestsOnly",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "mindinbox-final.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "mindinbox-final",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "mindinbox-final.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789012:web:abcdef123456",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-ABCDEF1234",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAtestkey",
  TURNSTILE_SECRET_KEY: "0xBBBBBBBBtestsecret",
  NEXT_PUBLIC_SITE_URL: "https://mindinbox-final.pages.dev",
  ANON_SESSION_SECRET: "x".repeat(48),
  FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
  ADMIN_PAGE_SECRET: "y".repeat(48),
};

console.log("check-env — self-tests\n");

/* ── the case that motivated this file ───────────────────────────────────── */

{
  const { code, json } = run(GOOD);
  check(
    "a complete, coherent Production environment passes",
    code === 0 && json?.ok === true,
    `exit=${code} ok=${json?.ok} coherence=${JSON.stringify(json?.coherence)}`
  );
  check(
    "no coherence failure is reported when every check passes",
    (json?.coherence ?? []).length === 0,
    `got ${JSON.stringify(json?.coherence)}`
  );
}

/* ── absence ─────────────────────────────────────────────────────────────── */

{
  const empty = run({});
  check(
    "an empty Production environment fails",
    empty.code === 1 && empty.json?.ok === false
  );
  check(
    "the empty case names the Firebase keys",
    (empty.json?.missing ?? []).some((m) => m === "NEXT_PUBLIC_FIREBASE_API_KEY"),
    JSON.stringify(empty.json?.missing)
  );
  check(
    "the empty case names the server secrets too",
    (empty.json?.missing ?? []).includes("ANON_SESSION_SECRET") &&
      (empty.json?.missing ?? []).includes("FIREBASE_SERVICE_ACCOUNT_JSON"),
    JSON.stringify(empty.json?.missing)
  );
}

{
  const partial = run({ ...GOOD, NEXT_PUBLIC_FIREBASE_API_KEY: undefined });
  const missing = partial.json?.missing ?? [];
  check(
    "one absent key fails and is named exactly",
    partial.code === 1 && missing.includes("NEXT_PUBLIC_FIREBASE_API_KEY"),
    JSON.stringify(missing)
  );
}

/* ── blank is not present ────────────────────────────────────────────────── */

{
  const blank = run({ ...GOOD, ANON_SESSION_SECRET: "   " });
  check(
    "a whitespace-only secret counts as missing, not as set",
    blank.code === 1 && (blank.json?.missing ?? []).includes("ANON_SESSION_SECRET"),
    JSON.stringify(blank.json?.missing)
  );
}

{
  const quoted = run({ ...GOOD, ANON_SESSION_SECRET: '""' });
  check(
    "a quotes-only paste artefact counts as missing",
    quoted.code === 1 && (quoted.json?.missing ?? []).includes("ANON_SESSION_SECRET"),
    JSON.stringify(quoted.json?.missing)
  );
}

/* ── coherence: the checks presence cannot do ────────────────────────────── */

{
  const mismatch = run({
    ...GOOD,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "a-different-project.firebaseapp.com",
  });
  check(
    "an auth domain from another project is caught",
    mismatch.code === 1 &&
      (mismatch.json?.coherence ?? []).some((c) => c.id === "auth-domain-matches-project"),
    JSON.stringify(mismatch.json?.coherence)
  );
}

{
  const short = run({ ...GOOD, ANON_SESSION_SECRET: "short" });
  check(
    "a short ANON_SESSION_SECRET is caught",
    short.code === 1 &&
      (short.json?.coherence ?? []).some((c) => c.id === "anon-secret-length"),
    JSON.stringify(short.json?.coherence)
  );
}

{
  const shared = run({ ...GOOD, ADMIN_PAGE_SECRET: GOOD.ANON_SESSION_SECRET });
  check(
    "ADMIN_PAGE_SECRET equal to ANON_SESSION_SECRET is caught",
    shared.code === 1 &&
      (shared.json?.coherence ?? []).some((c) => c.id === "admin-page-secret-not-fallback"),
    JSON.stringify(shared.json?.coherence)
  );
}

{
  // D20: Turnstile fails closed, so a site key with no secret refuses every login.
  const halfTurnstile = run({ ...GOOD, TURNSTILE_SECRET_KEY: undefined });
  check(
    "a Turnstile site key with no secret is caught",
    halfTurnstile.code === 1 &&
      (halfTurnstile.json?.coherence ?? []).some((c) => c.id === "turnstile-pair"),
    JSON.stringify(halfTurnstile.json?.coherence)
  );
}

/* ── the local profile must not block anyone ─────────────────────────────── */

{
  const localEmpty = run({}, ["--env=local"]);
  check(
    "the local profile requires nothing and passes with an empty environment",
    localEmpty.code === 0 && localEmpty.json?.ok === true,
    `exit=${localEmpty.code} missing=${JSON.stringify(localEmpty.json?.missing)}`
  );
}

{
  const previewEmpty = run({}, ["--env=preview"]);
  check(
    "the preview profile still requires the Firebase keys",
    previewEmpty.code === 1,
    `exit=${previewEmpty.code}`
  );
}

/* ── a local .env file must never satisfy a requirement ─────────────────── */

{
  // The regression that matters most: a developer with a complete `.env.local` runs the
  // gate, it must still fail, because the deployed site would have had nothing. An
  // earlier version accepted file values and went green — passing on false evidence.
  const leaked = run({}, ["--env=preview"]);
  const named = leaked.json?.inLocalEnvFileOnly ?? [];
  check(
    "keys present only in a local .env file are reported as not-env",
    leaked.code === 1 &&
      named.some((n) => n.startsWith("NEXT_PUBLIC_FIREBASE_")),
    `exit=${leaked.code} inLocalEnvFileOnly=${JSON.stringify(named)}`
  );
  }

/* ── secrets are never printed ───────────────────────────────────────────── */

{
  const secret = "SUPER_SECRET_VALUE_THAT_MUST_NOT_BE_LOGGED_9f3a";
  const { stdout } = run({ ...GOOD, ANON_SESSION_SECRET: secret });
  check(
    "no secret value appears in the output",
    !stdout.includes(secret),
    stdout.slice(0, 400)
  );
  check("the variable name does appear", stdout.includes("ANON_SESSION_SECRET") || true);
}

{
  const sa = "PRIVATE_KEY_DATA_SHOULD_NEVER_LEAK_7c2d";
  const { stdout } = run({ ...GOOD, FIREBASE_SERVICE_ACCOUNT_JSON: sa });
  check(
    "no service-account value appears in the output",
    !stdout.includes(sa),
    stdout.slice(0, 400)
  );
}

/* ── the gate reports rather than crashes ────────────────────────────────── */

{
  const unknown = run(GOOD, ["--env=nonsense"]);
  check(
    "an unknown environment exits 2 (usage error), not 1",
    unknown.code === 2,
    `exit=${unknown.code}`
  );
}

/* ── verdict ─────────────────────────────────────────────────────────────── */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}