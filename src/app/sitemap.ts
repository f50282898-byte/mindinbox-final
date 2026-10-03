import type { MetadataRoute } from "next";
import { INDEXABLE_ROUTES } from "@/lib/nav";
import { SITE_URL } from "@/lib/seo";

/**
 * Sitemap.
 *
 * Driven by `INDEXABLE_ROUTES` rather than restated here, so a route cannot be
 * added to navigation and forgotten in the sitemap (or vice versa).
 *
 * `/account`, `/admin`, `/god-mode-admin` and `/_design` are absent by
 * construction. `lastModified` is deliberately omitted: these pages are
 * statically generated and a build timestamp would be noise.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.7,
  }));
}
