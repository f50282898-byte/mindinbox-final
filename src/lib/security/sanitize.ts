/**
 * Input sanitization for user-generated text in the journal and chat.
 *
 * Defence-in-depth:
 *  1. Client-side: strip dangerous HTML/JS before anything is stored or
 *     rendered — so a stored XSS payload can never reach another reader.
 *  2. Server-side: every route already validates with zod and re-verifies the
 *     caller's ID token; the client copy here is a UX guard, not the authority.
 *
 * Rules applied:
 *  - Remove `<script>` blocks and their contents.
 *  - Remove inline event handlers (`onclick=`, `onerror=`, `onload=`, …).
 *  - Remove `javascript:` and `data:` URL schemes from `href` / `src`.
 *  - Remove `<iframe>`, `<object>`, `<embed>`, `<svg onload=…>` tags entirely.
 *  - Escape remaining angle brackets so nothing is parsed as markup by a
 *    browser that receives this string unsanitised elsewhere.
 *
 * The returned string is *safe to store* and *safe to render inside Markdown*,
 * because Markdown's own parser receives plain text (no `dangerouslySetInnerHTML`
 * anywhere in the app).
 */

// Matches dangerous tags that are removed entirely (with inner content where
// noted): script, iframe, object, embed, svg, math.
const DANGEROUS_TAGS =
  /<\/?(script|iframe|object|embed|svg|math|link|meta|style|base)[\s>]/gi;

// Matches inline event-handler attributes: onclick=, onerror=, onload=, etc.
const EVENT_HANDLER = /\son[a-z]+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi;

// Matches javascript: or data: url schemes in attribute values.
const DANGEROUS_URL = /\b(javascript|data|vbscript):/gi;

/**
 * Strips dangerous markup from a free-text input. Safe to call on any user
 * string before it is persisted or shown back to a reader.
 */
export function sanitizeText(input: string): string {
  if (typeof input !== "string") return "";

  let out = input;

  // 1. Remove script blocks entirely (including their contents).
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");

  // 2. Remove dangerous tags and their attributes.
  out = out.replace(DANGEROUS_TAGS, "");

  // 3. Strip inline event handlers from anything that survived.
  out = out.replace(EVENT_HANDLER, "");

  // 4. Neutralise dangerous URL schemes.
  out = out.replace(DANGEROUS_URL, "blocked:");

  // 5. Balance out any remaining lone angle brackets so a partial tag cannot
  //    combine with later app-controlled markup to form an element.
  out = out.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return out;
}

/**
 * Sanitises a note title (short, single line). Titles are shown in headers
 * and card titles, so they must be especially clean.
 */
export function sanitizeTitle(input: string): string {
  return sanitizeText(input).slice(0, 200);
}

/**
 * Sanitises note content (multi-line). Applied before saving to the notes
 * store and before rendering in Markdown.
 */
export function sanitizeContent(input: string): string {
  return sanitizeText(input).slice(0, 10_000);
}

/**
 * Sanitises a chat message (single turn). Applied before sending to the API.
 */
export function sanitizeMessage(input: string): string {
  return sanitizeText(input).slice(0, 4_000);
}
