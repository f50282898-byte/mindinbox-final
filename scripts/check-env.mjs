#!/usr/bin/env node
/**
 * Environment gate.
 *
 * Fails the build, with a readable message, when a variable the deployed site needs is
 * absent from the target environment.
 *
 * ## Why this exists rather than `env()`
 *
 * `src/lib/env.ts` validates with zod and **throws**. That is right for a server secret:
 * a missing API key should stop the process. But it made the no-Firebase build
 * impossible, because `env()` is imported by client code through `lib/firebase`, so a
 * build without Firebase keys could not even compile. The deployed site then either
 * failed to build, or built with a try/catch that hid the cause and shipped a login
 * form that silently did nothing.
 *
 * This script separates the two concerns:
 *
 *  - **The build succeeds** with whatever is configured. `/`, `/wisdom`, `/dialogue`,
 *    `/quotes`, `/pricing` and the legal pages genuinely do not need Firebase, and
 *    there is no reason a documentation build should be blocked by an auth key.
 *  - **CI fails** when Production is missing something, so the broken state is caught
 *    by a machine, not by a reader.
 *
 * That split is the whole design. The failure mode this replaces — a login page that
 * renders and then does nothing — is the worst kind, because it looks fine.
 *
 * ## Secrets are never printed
 *
 * Only variable **names** and a **length** are reported. A build log is the least
 * private place in a CI system: it is retained, searchable, and readable by anyone who
 * can see the project. The length is there to catch a pasted value that arrived with
 * quotes or a trailing newline, which is the common paste error and is otherwise
 * indistinguishable from a short-but-valid key.
 *
 * ## Modes
 *
 *   node scripts/check-env.mjs                  # strict: Production profile
 *   node scripts/check-env.mjs --env=preview    # preview profile
 *   node scripts/check-env.mjs --env=local      # permissive; CI and unset keys warn
 *   node scripts/check-env.mjs --profile=local  # same, by the profile name
 *   node scripts/check-env.mjs --json           # machine-readable, for CI annotations
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/* ── profiles ──────────────────────────────────────────────────────────────── */

/**
 * What each environment must have.
 *
 * `required` fails the build. `recommended` warns: the site works without it, but the
 * feature it backs is dead, and finding that out from a support request is worse than
 * finding it out here.
 *
 * `local` has no required set at all. A developer's first `npm run dev` should not need
 * a Firebase project, and the feedback loop for `npm run build` on a machine with no
 * secrets should be the build, not this script.
 */
const PROFILES = {
  production: {
    required: [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "ANON_SESSION_SECRET",
      "TURNSTILE_SECRET_KEY",
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      "ADMIN_PAGE_SECRET",
    ],
    recommended: [
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    ],
    description: "Production. Every listed variable must be present.",
  },
  preview: {
    required: [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    ],
    recommended: ["ANON_SESSION_SECRET", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
    description:
      "Preview. Enough Firebase to exercise sign-in; secrets optional because a preview " +
      "build must not be a place where a production secret can be pasted by accident.",
  },
  local: {
    required: [],
    recommended: ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"],
    description: "Local. Nothing required; the app degrades and prints to the console.",
  },
};

const aliases = { prod: "production", p: "production", dev: "local", development: "local" };

/* ── arguments ─────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
};

const asJson = flag("json") === "true";
const rawEnv = flag("env") ?? flag("profile");
const envName = aliases[rawEnv ?? ""] ?? rawEnv ?? "production";

if (!(envName in PROFILES)) {
  console.error(
    `check-env — unknown environment "${rawEnv}". Known: ${Object.keys(PROFILES).join(", ")}.`
  );
  process.exit(2);
}

const profile = PROFILES[envName];

/* ── values ────────────────────────────────────────────────────────────────── */

/**
 * Build-time values, from the environment plus any local `.env` files.
 *
 * `NEXT_PUBLIC_*` is inlined by Next at build time from the real process environment.
 * A value that exists only in a `.env.local` file on this machine is therefore not
 * necessarily what Cloudflare will see, which is exactly the confusion this script
 * exists to remove — so local files are read and reported as a separate source.
 */
function localEnvFiles() {
  return [".env", ".env.local", `.env.${envName}`, `.env.${envName}.local`]
    .map((name) => join(ROOT, name))
    .filter((p) => existsSync(p));
}

function parseEnvFile(path) {
  const found = new Map();
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return found;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    found.set(key, value);
  }
  return found;
}

const fileValues = new Map();
for (const path of localEnvFiles()) {
  for (const [k, v] of parseEnvFile(path)) if (!fileValues.has(k)) fileValues.set(k, v);
}

/**
 * Where a variable's value came from.
 *
 * Reported so a missing key can be diagnosed precisely — "you have it in `.env.local`
 * but not in the deploy environment" is a different instruction from "you have it
 * nowhere".
 */
function sourceOf(name) {
  const live = process.env[name];
  if (typeof live === "string" && live.trim() !== "") return "environment";
  if (fileValues.has(name)) return "env-file";
  return null;
}

/**
 * A value is present only if it is non-blank.
 *
 * Cloudflare's dashboard, a `.env` file, and a copy-paste from the Firebase console all
 * produce a stray `"` or trailing newline with some regularity. A blank or quote-only
 * value satisfies `!== undefined`, so a naive check passes a variable that will fail at
 * runtime with an opaque Firebase error.
 */
function isUsable(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  // A value that is only quotes or a quote-comma pair is a paste artefact, not a value.
  return !/^["',\s]+$/.test(trimmed);
}

/**
 * `present` means **in the real process environment**, and nothing else.
 *
 * This was wrong in the first version, which accepted a value found in `.env.local` as
 * satisfying a requirement. The consequence was the exact bug this script exists to
 * prevent, in the direction nobody expects: a developer with a complete `.env.local`
 * ran `npm run build:cf`, it went green, and the deployed site had no Firebase at all.
 * A gate that passes on the wrong evidence teaches you to trust a result that was never
 * true.
 *
 * So a `.env` file can explain a missing key, and can never excuse one.
 */
function describe(name) {
  const live = process.env[name];
  const inEnv = isUsable(live);
  const inFile = isUsable(fileValues.get(name));
  return {
    name,
    present: inEnv,
    source: inEnv ? "environment" : inFile ? "env-file" : null,
    length: (live ?? "").trim().length,
  };
}

/* ── the checks ────────────────────────────────────────────────────────────── */

/**
 * Coherence, not just presence.
 *
 * These are the configurations that pass every "is it set?" check and still fail at
 * runtime, which is the class of bug a presence check cannot catch.
 */
const COHERENCE = [
  {
    id: "auth-domain-matches-project",
    test: () => {
      const authDomain = (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? fileValues.get("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ?? "").trim();
      const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? fileValues.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ?? "").trim();
      if (!authDomain || !projectId) return null;
      if (!authDomain.includes(projectId)) {
        return {
          message:
            "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN does not contain NEXT_PUBLIC_FIREBASE_PROJECT_ID. " +
            "These are two fields of one Firebase web app; a mismatch means values from two " +
            "different projects were pasted. Sign-in would fail with an opaque auth error.",
        };
      }
      return null;
    },
  },
  {
    id: "anon-secret-length",
    test: () => {
      const value = process.env.ANON_SESSION_SECRET ?? fileValues.get("ANON_SESSION_SECRET") ?? "";
      // The anon cookie is HMAC-signed. A short secret is a guessable signature, and
      // the cookie decides which anonymous quota bucket a request lands in — so a weak
      // secret is a quota bypass, not just a weak cookie.
      if (value !== "" && value.trim().length < 32) {
        return {
          message: `ANON_SESSION_SECRET is ${value.trim().length} characters; 32 or more are required. A short signing secret lets a client forge a quota cookie.`,
        };
      }
      return null;
    },
  },
  {
    id: "admin-page-secret-not-fallback",
    test: () => {
      const value = process.env.ADMIN_PAGE_SECRET ?? "";
      if (value === "") return null;
      if (value === process.env.ANON_SESSION_SECRET) {
        return {
          message:
            "ADMIN_PAGE_SECRET equals ANON_SESSION_SECRET. Distinct secrets are required: " +
            "sharing one means a value leaked from the anonymous-cookie path also opens the " +
            "admin console.",
        };
      }
      return null;
    },
  },
  {
    id: "turnstile-pair",
    test: () => {
      const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? fileValues.get("NEXT_PUBLIC_TURNSTILE_SITE_KEY") ?? "";
      const secret = process.env.TURNSTILE_SECRET_KEY ?? fileValues.get("TURNSTILE_SECRET_KEY") ?? "";
      // D20: Turnstile fails closed. A site key with no secret means every challenge
      // fails, so every login is refused — which reads as "sign-in is broken".
      if (site.trim() !== "" && secret.trim() === "") {
        return {
          message:
            "NEXT_PUBLIC_TURNSTILE_SITE_KEY is set but TURNSTILE_SECRET_KEY is not. " +
            "Turnstile fails closed, so every sign-in and signup would be refused.",
        };
      }
      return null;
    },
  },
];

const required = profile.required.map(describe);
const recommended = profile.recommended.map(describe);
const missing = required.filter((r) => !r.present);
/** Required keys that exist in a local file but not in the environment. Never sufficient. */
const fromFileOnly = required.filter((r) => !r.present && r.source === "env-file");
const warnings = recommended.filter((r) => !r.present).map((r) => r.name);
/*
 * `.filter(Boolean)` would be wrong here: a coherent entry spreads to `{id, message:
 * undefined}` — truthy — so every passing check would be reported as failing, with the
 * word "undefined" where the explanation should be. A regression in this script would
 * have made a correct environment look broken, which is the worst direction for a gate.
 */
const coherence = COHERENCE.map((c) => ({ id: c.id, message: c.test()?.message ?? null }))
  .filter((c) => c.message !== null);

/* ── report ────────────────────────────────────────────────────────────────── */

if (asJson) {
  console.log(
    JSON.stringify(
      {
        environment: envName,
        ok: missing.length === 0 && coherence.length === 0,
        missing: missing.map((m) => m.name),
        inLocalEnvFileOnly: fromFileOnly.map((m) => m.name),
        recommended: warnings,
        coherence: coherence.map((c) => ({ id: c.id, message: c.message })),
      },
      null,
      2
    )
  );
} else {
  const lines = [];
  lines.push(`check-env — environment "${envName}"`);
  lines.push(`  ${profile.description}`);

  if (missing.length === 0) {
    lines.push(`  required: ${required.length}/${required.length} present`);
  } else {
    lines.push(`  required: ${required.length - missing.length}/${required.length} present`);
  }

  if (missing.length > 0) {
    lines.push("");
    lines.push("  MISSING (the build cannot ship this environment):");
    for (const m of missing) lines.push(`    - ${m.name}`);
  }

  if (fromFileOnly.length > 0) {
    lines.push("");
    lines.push("  IN A LOCAL .env FILE BUT NOT IN THE ENVIRONMENT:");
    lines.push("  These do not count as present. A file on this machine was never");
    lines.push("  compiled into the bundle and the deployed site will not have them:");
    for (const f of fromFileOnly) lines.push(`    - ${f.name}`);
  }

  if (coherence.length > 0) {
    lines.push("");
    lines.push("  INCOHERENT (present but will fail at runtime):");
    for (const c of coherence) lines.push(`    - [${c.id}] ${c.message}`);
  }

  if (warnings.length > 0 && missing.length === 0) {
    lines.push("");
    lines.push("  recommended but absent (the build will succeed; a feature will be dead):");
    for (const w of warnings) lines.push(`    - ${w}`);
  }

  if (missing.length > 0 || coherence.length > 0) {
    lines.push("");
    lines.push("  WHERE TO SET THEM");
    lines.push("  Cloudflare Pages -> your project -> Settings -> Variables and Secrets.");
    lines.push("  Add each name under BOTH Production and Preview.");
    lines.push("  Mark a value as a Secret for anything that is not a public Firebase web key.");
    lines.push("  Plain text for these, because Next.js inlines them at build time:");
    lines.push("    NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_APP_ID,");
    lines.push("    NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,");
    lines.push("    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,");
    lines.push("    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,");
    lines.push("    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    lines.push("  Secret for these, which must never reach the browser bundle:");
    lines.push("    ANON_SESSION_SECRET, TURNSTILE_SECRET_KEY,");
    lines.push("    FIREBASE_SERVICE_ACCOUNT_JSON, ADMIN_PAGE_SECRET");
    lines.push("");
    lines.push("  After adding a NEXT_PUBLIC_* value you MUST redeploy. Editing a variable");
    lines.push("  does not rebuild an existing deployment.");
  }

  console.log(lines.join("\n"));
}

/* ── verdict ───────────────────────────────────────────────────────────────── */

const failures = missing.length + coherence.length;

if (failures === 0) {
  if (!asJson) {
    console.log(
      `check-env — ${envName} is complete${warnings.length > 0 ? ` (${warnings.length} optional absent)` : ""}.`
    );
  }
  process.exit(0);
}

if (asJson) process.exit(1);

// A failure here is a configuration error, not a crash. The exit code and the message
// above are the deliverable; a stack trace would only bury them.
process.exit(1);