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
