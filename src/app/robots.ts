import type { MetadataRoute } from "next";
import { HIDDEN_ROUTES } from "@/lib/nav";
import { SITE_URL } from "@/lib/seo";

/**
 * robots.txt.
 *
 * Disallows administration and the account area. Disallowing alone does not
 * secure anything — those routes still enforce their own server-side identity
 * checks — it only keeps them out of search results and out of AI crawlers'
 * training sets, which matters for an app holding personal journal text.
 */
export default function robots(): MetadataRoute.Robots {
  const blocked = ["/admin", "/god-mode-admin", "/_design", "/account", "/api/", "/enter", "/tracker", "/journal", "/account"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: blocked,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

/** Kept adjacent so the two SEO routes cannot drift apart. */
export const ROBOTS_BLOCKED = [...HIDDEN_ROUTES, "/account", "/api/", "/enter", "/tracker", "/journal"];
