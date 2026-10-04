/**
 * Content Security Policy — one source, two consumers.
 *
 * ## Why a nonce rather than `'unsafe-inline'`
 *
 * The shipped `_headers` had `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Those
 * two keywords together remove essentially all of CSP's value against XSS: if inline
 * script is allowed, an injected `<script>` runs, and CSP was never going to stop it.
 * Everything else in the policy — `frame-ancestors 'none'`, `object-src 'none'` — is
 * still worth having, but the script policy was decorative.
 *
 * `'unsafe-eval'` is removable outright. Next.js needs it in development for hot
 * reloading; a production build does not, and `_headers` only ever reaches production.
 *
 * A **nonce** is what replaces `'unsafe-inline'`. The App Router emits its RSC flight
 * payload as inline `<script>` tags, so `script-src 'self'` alone would break every
 * page. `middleware.ts` generates a per-request nonce, puts it in the request's CSP
 * header (Next reads it from there and stamps it on its own scripts) and in the
 * response header (the browser enforces it).
 *
 * ## Why the domains are listed individually
 *
 * `connect-src` and `frame-src` are the two that matter for this product, and both had
 * problems:
 *
 *  - `frame-src` allowed `https://www.youtube.com`, which sets tracking cookies. The
 *    privacy policy says we do not follow readers across sites, and an embed that does
 *    is a contradiction the reader cannot see. Now `-nocookie` only.
 *  - `script-src` allowed `https://www.youtube.com`, on the assumption that we use the
 *    YouTube iframe API. We do not — `videos` are plain `<iframe src>` embeds. An
 *    origin that can execute script on our pages is a far larger grant than one that
 *    can be framed, and it was unnecessary.
 *
 * ## `style-src` keeps `'unsafe-inline'`, on purpose
 *
 * Tailwind injects a stylesheet, and the quote cards set per-card canvas dimensions
 * through inline styles. Removing it needs a full CSS-modules or nonce refactor across
 * every component. Inline *style* is not inline *script*: it cannot execute, and the
 * residual risk is limited to defacement. Recorded rather than hidden.
 */

/** Domains the browser may connect to for data. */
const CONNECT_SRC = [
  "'self'",
  // Firebase
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebasestorage.googleapis.com",
  // Google Sign-In (One Tap / OAuth popup)
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
  // Cloudflare Turnstile
  "https://challenges.cloudflare.com",
  // Billing provider — chosen but not yet integrated. Listed so the console does not
  // start reporting violations the day it is switched on.
  "https://api.paddle.com",
  "https://api.lemonsqueezy.com",
].join(" ");

/** Frames we allow to embed us — none, but the reader may embed these. */
const FRAME_SRC = [
  "'self'",
  // Turnstile renders itself in a frame.
  "https://challenges.cloudflare.com",
  // Lectures. `-nocookie` only — see the note above.
  "https://www.youtube-nocookie.com",
].join(" ");

/** Scripts we execute. No third-party origin belongs here. */
const SCRIPT_SRC = ["'self'"].join(" ");

const IMG_SRC = [
  "'self'",
  "data:",
  "blob:",
  "https://*.googleusercontent.com",
  "https://i.ytimg.com",
  "https://yt3.ggpht.com",
].join(" ");

const FONT_SRC = ["'self'", "data:", "https://fonts.gstatic.com"].join(" ");

const STYLE_SRC = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"].join(" ");

/**
 * The nonce directives.
 *
 * Kept separate so the static `_headers` fallback can omit them (it has no nonce to
 * offer) while the middleware policy includes them. `'strict-dynamic'` lets a
 * nonce-carrying script load further scripts without allow-listing every chunk host.
 */
export interface CspOptions {
  /** Present for a real request; absent for the static fallback in `_headers`. */
  nonce?: string;
  /** Extra directives merged last, e.g. `report-only` experiments. */
  extra?: Record<string, string[]>;
}

/** The directives, as a plain object, so tests can assert on them individually. */
export function cspDirectives(options: CspOptions = {}): Record<string, string[]> {
  const scriptSrc = options.nonce
    ? `'nonce-${options.nonce}' 'strict-dynamic'`
    : SCRIPT_SRC;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [scriptSrc],
    // Next's build emits `<link rel=preload as=script>`; without this the
    // strict-dynamic policy refuses the preloads it just authorised.
    "script-src-elem": [scriptSrc],
    "style-src": STYLE_SRC.split(" "),
    "img-src": IMG_SRC.split(" "),
    "font-src": FONT_SRC.split(" "),
    "connect-src": CONNECT_SRC.split(" "),
    "frame-src": FRAME_SRC.split(" "),
    "media-src": ["'self'", "blob:"],
    // The quote-card canvas draws into a blob URL and offers it as a download.
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Clickjacking. `X-Frame-Options: DENY` is kept as a legacy fallback.
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    // No mixed content, ever, including on the fallback.
    "upgrade-insecure-requests": [],
    ...(options.extra ?? {}),
  };

  return directives;
}

/** Renders a directives object as a header value. */
export function renderCsp(options: CspOptions = {}): string {
  return Object.entries(cspDirectives(options))
    .map(([directive, values]) => (values.length === 0 ? directive : `${directive} ${values.join(" ")}`))
    .join("; ");
}

/**
 * The other response headers, from the same module.
 *
 * Kept next to the CSP so a new header cannot be added to one file and forgotten in
 * the other — `scripts/check-headers.mjs` asserts the two stay in agreement.
 */
export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  // Two years, subdomains, preload. Only meaningful over HTTPS, which Cloudflare
  // terminates — so this is safe to send unconditionally.
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  // Stops a browser second-guessing a served Content-Type, which is one half of how an
  // uploaded file becomes script.
  ["X-Content-Type-Options", "nosniff"],
  // `strict-origin-when-cross-origin` keeps the path off third parties while still
  // telling them which site referred a visitor. `no-referrer` would be stronger and
  // would break nothing we do; changed to `strict-origin` below.
  ["Referrer-Policy", "strict-origin"],
  // Camera and microphone are unused. Denying them removes a class of prompt the
  // browser would otherwise show a reader on our behalf.
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  ],
  ["X-Frame-Options", "DENY"],
  // Tells the browser not to sniff a download's type either.
  ["X-DNS-Prefetch-Control", "off"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
];

/** Names of the headers, for the drift check. */
export const SECURITY_HEADER_NAMES = SECURITY_HEADERS.map(([name]) => name.toLowerCase());
