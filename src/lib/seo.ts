/**
 * SEO constants — one place for the canonical origin.
 *
 * Read from the environment so preview deployments do not emit canonical URLs
 * pointing at production. Falls back to the production origin when unset,
 * because a missing env var must not produce a relative canonical.
 */

const RAW_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mindinbox-final.pages.dev";

export const SITE_URL = RAW_SITE_URL.replace(/\/+$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Canonical URLs for pages that need explicit canonical tags.
 * These pages have `noindex` but still need correct canonical for SEO.
 */
export const CANONICAL_URLS: Record<string, string> = {
  "/enter": `${SITE_URL}/enter`,
  "/tracker": `${SITE_URL}/tracker`,
  "/journal": `${SITE_URL}/journal`,
  "/account": `${SITE_URL}/account`,
  "/privacy": `${SITE_URL}/privacy`,
  "/terms": `${SITE_URL}/terms`,
  "/refund": `${SITE_URL}/refund`,
  "/pricing": `${SITE_URL}/pricing`,
  "/paths": `${SITE_URL}/paths`,
  "/quotes": `${SITE_URL}/quotes`,
  "/wisdom": `${SITE_URL}/wisdom`,
  "/dialogue": `${SITE_URL}/dialogue`,
  "/oracle": `${SITE_URL}/oracle`,
  "/sanctum": `${SITE_URL}/sanctum`,
} as const;

export function getCanonicalUrl(path: string): string {
  return CANONICAL_URLS[path] ?? absoluteUrl(path);
}
