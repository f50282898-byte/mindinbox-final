/**
 * The AI consent gate.
 *
 * ## The rule
 *
 * `settings.aiJournalConsent` is the **only** thing that permits the server to read
 * a reader's journal or their mood. It defaults to false, it is a switch of its own
 * rather than part of a bundle, and it is checked *before* any read is issued — not
 * after the data has been loaded and filtered.
 *
 * That ordering is the whole point. A filter applied after the read still reads the
 * journal; on a server the read is the disclosure. So this module exports two
 * things:
 *
 *  - `consentAllowsReading` — a pure predicate, unit-testable on its own
 *  - `readJournalForAi` — the **only** function in the codebase permitted to read a
 *    day document for the Oracle's benefit, and it refuses without consent
 *
 * Everything else that touches `users/{uid}/days` is display code running in the
 * reader's own browser, on data already on their device.
 *
 * ## What consent does and does not cover
 *
 * On: journal block text, mood, check-in ratings, practice notes, habits.
 * Off, always: principle text (it is a statement of identity, not a record of a
 * day), day keys with no content, and anything about *when* the reader used the
 * product. Aggregates computed from consented content — a count of days, a mean
 * rating — are inside the consent, because they are derived from the content.
 */

import { getDocument } from "@/lib/google/firestore-rest";
import type { DayDocument } from "./types";

/** The consent flag as stored. Anything unrecognised is treated as refusal. */
export interface AiConsent {
  aiJournalConsent?: unknown;
}

/**
 * Whether the stored settings permit AI reading.
 *
 * Written as an explicit `=== true` rather than a truthiness check on purpose. A
 * corrupt value, a string `"false"`, or a document from a future schema must all
 * refuse. Consent that cannot be positively identified is not consent.
 */
export function consentAllowsReading(settings: AiConsent | null | undefined): boolean {
  return settings?.aiJournalConsent === true;
}

export type ConsentDecision =
  | { allowed: true }
  | { allowed: false; reason: "no_user" | "consent_off"; code: string; message: string };

/**
 * Decides, with the reader-facing wording, whether a request may proceed.
 *
 * The two refusals are deliberately worded differently: "you have not turned this
 * on" is fixable by the reader, "not signed in" is not. Telling someone to enable a
 * switch they cannot see is worse than useless.
 */
export function decideAiReading(
  uid: string | null,
  settings: AiConsent | null | undefined
): ConsentDecision {
  if (!uid) {
    return {
      allowed: false,
      reason: "no_user",
      code: "no_identity",
      message: "سجّل الدخول أولاً.",
    };
  }
  if (!consentAllowsReading(settings)) {
    return {
      allowed: false,
      reason: "consent_off",
      code: "consent_required",
      message:
        "لم تُفعّل قراءة مفكرتك. يمكنك تفعيلها من الإعدادات، أو الاكتفاء بهذا دونها.",
    };
  }
  return { allowed: true };
}

export interface AiJournalPayload {
  /** `yyyy-mm-dd`, ascending. Day keys only — no content. */
  days: Array<{
    date: string;
    /** Present only because consent covers it. */
    checkIn?: DayDocument["checkIn"];
    practice?: DayDocument["practice"];
    journal?: Array<{ template: string; text: string }>;
  }>;
}

/**
 * Reads journal days for the Oracle — the single sanctioned reader.
 *
 * Throws `CONSENT_DENIED` rather than returning an empty array, because an empty
 * array is indistinguishable from "you have nothing" and would let a caller render
 * "you seem to have had a quiet week" at someone who never consented. A caller must
 * have to handle the refusal explicitly.
 *
 * `read` is injected so a test can observe *whether a read was issued at all* —
 * which is the property that matters and the one a post-hoc filter cannot satisfy.
 */
export async function readJournalForAi(args: {
  uid: string;
  settings: AiConsent | null | undefined;
  from: string;
  to: string;
  /** Injected for testability; defaults to the real REST reader. */
  read?: (path: string) => Promise<DayDocument | null>;
}): Promise<AiJournalPayload> {
  const decision = decideAiReading(args.uid, args.settings);
  if (!decision.allowed) {
    throw Object.assign(new Error(decision.message), {
      name: "CONSENT_DENIED",
      code: decision.code,
      reason: decision.reason,
    });
  }

  // Only now is a read issued. The settings document itself was read to make the
  // decision, and it holds no journal content — only the flag.
  const read = args.read ?? defaultRead;
  const payload: AiJournalPayload = { days: [] };

  for (let offset = 0; offset < 400; offset += 1) {
    const key = shiftDay(args.from, offset);
    if (key > args.to) break;

    const day = await read(`users/${args.uid}/days/${key}`);
    if (!day) continue;

    // Stripped to what the Oracle is allowed to see. `habits` and `virtues` are
    // dropped: neither is needed for a weekly reflection, and habits in particular
    // describe a routine the reader may not want characterised.
    payload.days.push({
      date: key,
      ...(day.checkIn ? { checkIn: day.checkIn } : {}),
      ...(day.practice ? { practice: day.practice } : {}),
      ...(day.journal?.length
        ? { journal: day.journal.map((b) => ({ template: b.template, text: b.text })) }
        : {}),
    });
  }

  return payload;
}

async function defaultRead(path: string): Promise<DayDocument | null> {
  try {
    return await getDocument<DayDocument>(path);
  } catch {
    return null;
  }
}

/** `yyyy-mm-dd` shifted by `n` days. Local copy of the calendar helper, kept tiny
 *  so this module has no import cycle with the client-side day-key module. */
function shiftDay(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}
