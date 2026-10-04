/**
 * Is Firebase configured in this build?
 *
 * ## Why this module exists
 *
 * There were once two answers to that question. `lib/firebase.ts` computed a boolean at
 * module load; `lib/firebase/client.ts` computed the same thing behind a function. They
 * disagreed in shape (const vs call), in what they required (three keys vs six), and in
 * behaviour under a partial config. A component asking "is Firebase configured?" could
 * import either one and get a different answer.
 *
 * So the question is asked here, once, and every consumer imports the answer.
 *
 * ## It reads `process.env` directly, not `env()`
 *
 * `env()` in `lib/env.ts` **throws** when a required variable is missing — which is
 * correct for a secret, and wrong here. A build with no Firebase configuration is a
 * legitimate state: the marketing pages, the legal pages, `/wisdom`, `/quotes`,
 * `/pricing` and `/dialogue` all work with no Firebase at all. This module exists so
 * those routes can be built and shipped in that state, with the Firebase-dependent
 * routes degrading to a quiet screen instead of failing the build.
 *
 * `scripts/check-env.mjs` is the counterpart that refuses to let that state reach
 * Production. The split is deliberate: **the build succeeds and the pages degrade, but
 * the CI gate fails**, so a misconfigured Production deploy is caught before a human
 * notices a dead login form.
 *
 * ## The `required` set is the minimum that identifies a project
 *
 * Three keys identify a Firebase web app: `apiKey`, `projectId`, `appId`. The other four
 * are needed for specific features (Storage needs the bucket, Analytics needs the
 * measurement id) and are reported separately by `missingFirebaseKeys()` so a partial
 * config gets a precise diagnosis rather than a blanket "not configured".
 */

const KEYS = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
  measurementId: "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
} as const;

export type FirebaseEnvKey = (typeof KEYS)[keyof typeof KEYS];

/** All seven, in the order the Firebase console shows them. */
export const FIREBASE_ENV_KEYS: readonly FirebaseEnvKey[] = [
  KEYS.apiKey,
  KEYS.authDomain,
  KEYS.projectId,
  KEYS.storageBucket,
  KEYS.messagingSenderId,
  KEYS.appId,
  KEYS.measurementId,
];

/**
 * The three that identify a project.
 *
 * `MEASUREMENT_ID` is deliberately excluded: Analytics is optional, is loaded only
 * after consent, and its absence must not disable sign-in. Blocking on it would mean a
 * project that declined Analytics could never authenticate anyone.
 */
const REQUIRED: readonly FirebaseEnvKey[] = [
  KEYS.apiKey,
  KEYS.projectId,
  KEYS.appId,
];

/**
 * Every key, read with a **literal** member access.
 *
 * ## Why this function exists at all
 *
 * This is the most consequential line in the file, and it is one line per key on
 * purpose. It used to be `process.env[key]` — a computed index — and that worked on the
 * server and silently returned `undefined` in the browser, every time.
 *
 * Next.js does not have a `process.env` object in client bundles. It substitutes the
 * *text* of `process.env.NEXT_PUBLIC_FOO` at build time, one literal expression at a
 * time, using webpack's DefinePlugin. `process.env[key]` is not that expression: the key
 * is a variable, so nothing is substituted, the lookup runs against an empty object, and
 * it answers `undefined`.
 *
 * The result was a build that was green on both sides and disagreed about whether
 * Firebase existed:
 *
 * - server: keys present → the full sign-in form rendered into the HTML
 * - browser: `isFirebaseConfigured()` → `false` → React threw away that HTML
 *   (hydration error #423) and re-rendered "sign-in is not available right now"
 *
 * So with Firebase correctly configured in Cloudflare, **no visitor could ever sign in**.
 * The journal, the tracker, `/account` and `/god-mode-admin` all sit behind the same
 * answer and were all equally unreachable. `lib/firebase.ts`, which builds `firebaseConfig`
 * with static reads, was meanwhile handing the browser the real keys — a contradiction
 * visible only in the access style.
 *
 * Nothing in the test suite could see this: under vitest `process.env` is a real runtime
 * object, so the computed access worked perfectly in every test and only failed after
 * `next build`. `config.test.ts` now reads this file's source text and fails if a computed
 * `process.env[` comes back.
 *
 * Reading them one per line is the fix. Keep it that way: a loop here reintroduces the
 * bug, and the failure is invisible until someone tries to sign in.
 */
function readFirebaseEnv(): Record<FirebaseEnvKey, string> {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
  };
}

/** Every key present and non-empty. */
export function presentFirebaseKeys(): FirebaseEnvKey[] {
  const env = readFirebaseEnv();
  return FIREBASE_ENV_KEYS.filter((key) => env[key].trim() !== "");
}

/**
 * Required keys that are missing or blank.
 *
 * Empty string counts as missing. Cloudflare's dashboard and a stray `""` in an `.env`
 * file both produce one, and a blank `apiKey` satisfies a truthiness check in a way a
 * real key never would — the failure would surface as an opaque Firebase error at
 * runtime instead of here.
 */
export function missingFirebaseKeys(): FirebaseEnvKey[] {
  const env = readFirebaseEnv();
  return REQUIRED.filter((key) => env[key].trim() === "");
}

/** Additional keys present in the list but not required for sign-in. */
export function optionalFirebaseKeysMissing(): FirebaseEnvKey[] {
  const env = readFirebaseEnv();
  return FIREBASE_ENV_KEYS.filter(
    (key) => !REQUIRED.includes(key) && env[key].trim() === ""
  );
}

/** True when sign-in and Firestore can work. The one answer, used everywhere. */
export function isFirebaseConfigured(): boolean {
  return missingFirebaseKeys().length === 0;
}

/**
 * The project id, or `""`.
 *
 * Never throws. `auth/server.ts` needs this to verify ID tokens; when it is empty that
 * verification fails closed, which is the correct behaviour for a build with no
 * Firebase configuration.
 */
export function firebaseProjectIdOrEmpty(): string {
  // Static access, for the same reason as every read in `readFirebaseEnv`. This one is
  // load-bearing on the server too: `auth/server.ts` verifies ID tokens against it, and
  // an empty value there fails verification closed — correctly, but silently, which is
  // how a misconfigured project would present as "every token is forged".
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
}

/**
 * A developer-facing diagnosis. **Never render this.**
 *
 * It names variables, which is the right information for a console and the wrong
 * information for a reader: a public page that says "set NEXT_PUBLIC_FIREBASE_API_KEY"
 * tells an attacker which key to go and steal, and tells a visitor that this is a
 * half-built site. `useFirebaseNotice()` logs it once; the UI shows a calm line.
 */
export function firebaseConfigReport(): {
  configured: boolean;
  missingRequired: FirebaseEnvKey[];
  missingOptional: FirebaseEnvKey[];
  present: FirebaseEnvKey[];
} {
  return {
    configured: isFirebaseConfigured(),
    missingRequired: missingFirebaseKeys(),
    missingOptional: optionalFirebaseKeysMissing(),
    present: presentFirebaseKeys(),
  };
}