/**
 * YouTube link validation for the Sanctum library.
 *
 * ## Why this needs its own module
 *
 * A video URL typed by an admin ends up in an `iframe` on a page that has a Content
 * Security Policy. Two failure modes follow, and neither is caught by a type check:
 *
 * 1. **Privacy.** `youtube.com/embed/…` sets cookies and, with `youtube-nocookie.com`,
 *    does not. The privacy policy says we do not track readers across sites; a lecture
 *    embed that quietly does is a contradiction the reader cannot see.
 * 2. **Injection.** Any host that is not on the list can be framed by an `iframe`, and
 *    `javascript:`/`data:` URLs can carry script. So the check is a **closed
 *    allow-list of exact hosts**, not a regex that looks for "youtube" somewhere.
 *
 * A regex like `/youtube/` matches `notyoutube.example.com`. That has been the bug in
 * every video allow-list ever written.
 */

/**
 * The only hosts accepted on input.
 *
 * `www.youtube-nocookie.com` is in the list so the function is **idempotent**:
 * feeding its own output back in must succeed. Without it, a stored `embedUrl` could
 * never be re-validated on read, and a read path that cannot check what it stored is
 * not checking anything. A test caught this — `isCanonicalEmbedUrl` returned false for
 * the module's own output.
 *
 * Accepting it does not weaken the allow-list: it is a fixed, Google-owned host that we
 * emit ourselves, and accepting it changes nothing about which *third-party* domains can
 * be framed.
 */
const ACCEPTED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "www.youtube-nocookie.com",
]);

/** The only host we ever emit. Everything is normalised to this. */
const NOCOOKIE_HOST = "www.youtube-nocookie.com";

export type YouTubeRejection =
  | "empty"
  | "unparseable"
  | "scheme"
  | "host_not_allowed"
  | "no_video_id";

export type YouTubeResult =
  | { ok: true; /** Canonical, `youtube-nocookie` embed URL. Safe to put in an iframe. */ embedUrl: string; videoId: string }
  | { ok: false; reason: YouTubeRejection };

/**
 * Validates and normalises a video link.
 *
 * Accepts the two forms people actually paste — `youtube.com/watch?v=…`,
 * `youtu.be/…` — plus `youtube.com/embed/…` and `/shorts/…`, and emits
 * `youtube-nocookie.com/embed/…` for all of them.
 *
 * ## `youtu.be` short links carry no cookie by default, but we still normalise
 *
 * `youtu.be` itself sets no tracking cookie. Rewriting it to `-nocookie` keeps every
 * embed on one host, so the CSP needs one `frame-src` entry rather than two, and one
 * place to reason about later if that changes.
 */
export function toNoCookieEmbedUrl(input: string): YouTubeResult {
  const raw = (input ?? "").trim();
  if (raw.length === 0) return { ok: false, reason: "empty" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  // Refuse any scheme that is not https. `http:` would be a downgrade and `javascript:`
  // / `data:` are the actual injection vectors — all three are covered by this line.
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };

  // Exact host match. Not `.endsWith("youtube.com")`, not `.includes("youtube")`.
  if (!ACCEPTED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: "host_not_allowed" };
  }

  const videoId = extractVideoId(url);
  if (!videoId) return { ok: false, reason: "no_video_id" };

  return {
    ok: true,
    videoId,
    // Built by concatenation from a validated id against a fixed host, so there is no
    // path for the id to carry a slash, a quote, or a fragment out of this string.
    embedUrl: `https://${NOCOOKIE_HOST}/embed/${videoId}`,
  };
}

/**
 * Pulls the video id out of any of the accepted URL shapes.
 *
 * Returns only `[A-Za-z0-9_-]{11}` — YouTube's own id alphabet. Anything else is
 * rejected rather than escaped, because an id that needs escaping is not an id.
 */
function extractVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const ID = /^[A-Za-z0-9_-]{11}$/;

  if (host === "youtu.be" || host === "www.youtu.be") {
    const candidate = url.pathname.split("/").filter(Boolean)[0];
    return candidate && ID.test(candidate) ? candidate : null;
  }

  // `?v=` works on every youtube.com shape.
  const v = url.searchParams.get("v");
  if (v && ID.test(v)) return v;

  // Path shapes: /embed/ID, /shorts/ID, /live/ID, /v/ID
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const [kind, candidate] = parts;
    if (kind === "embed" || kind === "shorts" || kind === "live" || kind === "v") {
      if (candidate && ID.test(candidate)) return candidate;
    }
  }

  return null;
}

/** True when a stored value is already a normalised `-nocookie` embed URL. */
export function isCanonicalEmbedUrl(input: string): boolean {
  const result = toNoCookieEmbedUrl(input);
  return result.ok && result.embedUrl === input.trim();
}

/**
 * Every accepted host, for the admin UI to display.
 *
 * Exported so the console can tell an admin *why* a link was refused instead of only
 * that it was.
 */
export const ALLOWED_VIDEO_HOSTS: readonly string[] = [...ACCEPTED_HOSTS];
