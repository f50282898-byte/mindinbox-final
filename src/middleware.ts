import { NextResponse, type NextRequest } from "next/server";
import { renderCsp, SECURITY_HEADERS } from "@/lib/security/csp";

/**
 * Security headers, with a per-request CSP nonce.
 *
 * ## Why middleware exists at all
 *
 * `public/_headers` is applied by the Cloudflare Pages edge and is the right place for
 * a *static* header set. It cannot supply a **nonce**, because a nonce has to be unique
 * per response and match the inline scripts in that same response. So the CSP is set
 * here, where a nonce can be minted, and `_headers` keeps a documented fallback.
 *
 * The fallback matters: if the middleware is ever removed, misconfigured, or not
 * supported by the Pages adapter, the site degrades to a stricter-than-before policy
 * rather than to none.
 *
 * ## How the nonce reaches Next's own scripts
 *
 * Next reads the nonce out of the **request's** `Content-Security-Policy` header and
 * stamps it onto the scripts it emits. So the header is set on both the request and
 * the response. Setting only the response would leave Next's inline flight scripts
 * without a nonce and break every page — which is the failure mode to watch for if
 * this ever stops working.
 *
 * ## Only `unsafe-eval` is allowed, and only outside production
 *
 * Hot reloading needs it. A production build does not, and a policy that permits
 * `eval` in production permits turning a string into code, which is most of what an
 * XSS payload wants.
 */

export const config = {
  /**
   * Every path except static assets.
   *
   * `_next/static` is excluded because it is immutable, fingerprinted, and served
   * with its own cache header; running middleware over it would add latency for no
   * benefit. Images and the favicon likewise.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

/** A fresh nonce per request. 16 random bytes is ample; the value is not a secret. */
function mintNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest) {
  const nonce = mintNonce();
  const isDev = process.env.NODE_ENV === "development";

  const csp = renderCsp({
    nonce,
    // Development only. Present here, absent in production — see the note above.
    extra: isDev ? { "script-src-attr": ["'unsafe-eval'"] } : {},
  });

  // On the request, so Next can read the nonce and apply it to its own tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Any inbound header claiming to be ours is attacker-controlled. Stripped so a
  // request cannot arrive already carrying a permissive CSP.
  requestHeaders.delete("x-content-type-options");
  requestHeaders.delete("x-frame-options");

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of SECURITY_HEADERS) {
    response.headers.set(name, value);
  }

  return response;
}
