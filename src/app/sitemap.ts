import type { MetadataRoute } from "next";
import { INDEXABLE_ROUTES } from "@/lib/nav";
import { SITE_URL } from "@/lib/seo";
import {
  FIREBASE_DEPENDENT_ROUTES,
  isFirebaseConfigured,
} from "@/lib/firebase/routes";

/**
 * Sitemap.
 *
 * Driven by `INDEXABLE_ROUTES` rather than restated here, so a route cannot be
 * added to navigation and forgotten in the sitemap (or vice versa).
 *
 * `/account`, `/admin`, `/god-mode-admin` and `/_design` are absent by
 * construction. `lastModified` is deliberately omitted: these pages are
 * statically generated and a build timestamp would be noise.
 *
 * ## Routes that need Firebase are dropped when Firebase is absent
 *
 * In a build without Firebase configuration, `/enter` and `/tracker` render an
 * unavailable screen. Listing them would be an invitation to a visitor who follows a
 * search result into a page that cannot work — the exact outcome `noindex` on those
 * pages exists to prevent, and a sitemap entry would reintroduce it through the other
 * door.
 *
 * `/journal` is also listed in `FIREBASE_DEPENDENT_ROUTES` and dropped. Its local
 * mirror still works without Firebase, but without it nothing is ever synced, so the
 * page promises "saved in your account" and cannot deliver. Advertising a promise the
 * build cannot keep is worse than not advertising the page.
 *
 * Reading `process.env` here is correct rather than incidental: `sitemap.ts` is
 * evaluated at build time, which is exactly when `NEXT_PUBLIC_*` is inlined. It cannot
 * see a runtime change, which is the same reason adding a variable in the Cloudflare
 * dashboard requires a redeploy.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = isFirebaseConfigured()
    ? INDEXABLE_ROUTES
    : INDEXABLE_ROUTES.filter(
        (route) => !(FIREBASE_DEPENDENT_ROUTES as readonly string[]).includes(route)
      );

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.7,
  }));
}
