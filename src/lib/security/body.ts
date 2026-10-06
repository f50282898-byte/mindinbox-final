/**
 * Bounded JSON body reading.
 *
 * ## Why zod's `.max()` is not a body limit
 *
 * `z.string().max(4000)` bounds a *field*, after the body has already been read,
 * stringified into memory, and handed to the JSON parser. A single request carrying a
 * 100 MB `messages` array — or a deeply nested object that parses slowly — is fully
 * materialised before zod gets a say.
 *
 * So the bound has to come first. This module checks `Content-Length` before reading
 * anything, and then reads with a hard cap, and only then parses.
 *
 * ## The read is streaming, not `request.json()`
 *
 * `request.json()` is `await request.text()` then `JSON.parse`, and `text()` will
 * buffer an arbitrarily large body. Reading the stream and aborting at the limit means
 * an oversized request costs us the limit, not its own size.
 *
 * ## Every failure looks the same
 *
 * Oversized, unparseable, and schema-invalid all produce the same client-facing
 * message. Distinguishing them would tell a prober which of the three they managed —
 * which is free reconnaissance. The reason goes to the server log, keyed by category.
 */

import { z } from "zod";
import { log } from "@/lib/log";

/**
 * Per-route budgets.
 *
 * Chosen from what each route actually accepts, not from one global number. A
 * conversation legitimately carries more than a `quoteId`.
 */
export const BODY_LIMITS = {
  /** A chat turn: history plus the new message. */
  ai: 64 * 1024,
  /** A quote card request: an id and a template. */
  quoteCard: 4 * 1024,
  /** The admin site document: nav, pricing, videos. */
  siteContent: 128 * 1024,
  /** A publish/undo: a version number. */
  adminAction: 2 * 1024,
  /** Signals: a batch of small events. */
  signals: 16 * 1024,
  /** Dialogue: the opening prompt. */
  dialogue: 16 * 1024,
  /** Auth: credentials and tokens. */
  auth: 16 * 1024,
} as const;

export type BodyLimitName = keyof typeof BODY_LIMITS;

export type ReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; category: "too_large" | "unparseable" | "invalid"; status: 400 | 413 };

/**
 * Reads, bounds, parses and validates a JSON body.
 *
 * The order is the whole point: length, then read-with-cap, then parse, then validate.
 */
export async function readJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  limitName: BodyLimitName
): Promise<ReadResult<z.infer<S>>> {
  const limit = BODY_LIMITS[limitName];

  /* ── 1. Content-Length, the cheap rejection ────────────────────────────────
     Trusted only as a *hint*: a client may omit it or understate it, which is why
     step 2 exists. But when it is present and over the limit, this costs nothing. */
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > limit) {
      log.warn("body_rejected_declared_length", { route: limitName, declared: n });
      return { ok: false, category: "too_large", status: 413 };
    }
  }

  /* ── 2. Streamed read with a hard cap ──────────────────────────────────────
     The cap is enforced as bytes accumulate, so the memory cost is bounded by `limit`
     regardless of what the client claims or sends. */
  const reader = request.body?.getReader();
  if (!reader) {
    // No body at all. Treated as unparseable rather than as an empty object, because a
    // route that requires fields should not silently run with none.
    return { ok: false, category: "unparseable", status: 400 };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        // Cancelled rather than drained: finishing the read would defeat the point.
        await reader.cancel().catch(() => undefined);
        log.warn("body_rejected_stream_length", { route: limitName, total });
        return { ok: false, category: "too_large", status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, category: "unparseable", status: 400 };
  }

  /* ── 3. Parse ────────────────────────────────────────────────────────────── */
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(merged));
  } catch {
    return { ok: false, category: "unparseable", status: 400 };
  }

  /* ── 4. Validate ────────────────────────────────────────────────────────── */
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Field names and messages are logged, never returned. A zod error names every
    // field the route accepts, which is a free schema dump for a prober.
    log.warn("body_rejected_schema", {
      route: limitName,
      issues: parsed.error.issues.length,
    });
    return { ok: false, category: "invalid", status: 400 };
  }

  return { ok: true, value: parsed.data };
}

/**
 * The client-facing message, identical for every failure category.
 *
 * One string for all three, deliberately. See the note at the top of the file.
 */
export const BODY_REJECTED_MESSAGE = "طلب غير صالح.";

/** The status to return: 413 only for a size problem, so a client can tell it shrank. */
export function bodyErrorStatus(result: { category: string; status: 400 | 413 }): 400 | 413 {
  return result.status;
}
