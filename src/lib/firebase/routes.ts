/**
 * Which routes need Firebase?
 *
 * Kept out of `config.ts` (which is about the environment) and out of
 * `FirebaseRequired.tsx` (which is a client component and must not be imported by a
 * build-time module), so that `sitemap.ts`, `robots.ts` and the pages themselves can
 * all read the same list. One list, three consumers, no drift.
 *
 * ## Why `/journal` counts
 *
 * Its local mirror genuinely works without Firebase — entries are written to the device
 * first. But nothing ever syncs, so the page's promise ("saved in your account, available
 * offline") cannot be kept, and a reader who wrote three weeks of journal entries would
 * lose them on a new device with no warning. A degraded feature that silently loses data
 * is worse than an absent one, so the route is treated as Firebase-dependent for
 * indexing purposes and the unavailable screen says so.
 */

/**
 * Routes that cannot fully work without Firebase configuration.
 *
 * Each of these exports `robots: { index: false, follow: false }` in its own metadata —
 * a client component cannot set metadata in time for a crawler — and each is dropped
 * from the sitemap when `isFirebaseConfigured()` is false.
 */
export const FIREBASE_DEPENDENT_ROUTES = [
  "/enter",
  "/tracker",
  "/journal",
] as const;

export type FirebaseDependentRoute = (typeof FIREBASE_DEPENDENT_ROUTES)[number];

/**
 * Reads the Firebase variables without throwing.
 *
 * A plain re-export would drag `@/lib/env` — which validates and throws — into every
 * build-time module that needs to ask this question. `import { env }` inside a
 * `sitemap.ts` would make a sitemap generation fail on a missing optional key.
 */
export { isFirebaseConfigured, missingFirebaseKeys, presentFirebaseKeys } from "./config";