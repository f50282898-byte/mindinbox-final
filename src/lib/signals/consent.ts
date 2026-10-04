/**
 * Consent.
 *
 * ## Two switches, not one
 *
 * The brief separates them, and the separation is the point:
 *
 *  - **`conversation`** — signals from what they choose and ask in the product:
 *    philosopher, question topic, lesson completed, habit ticked.
 *  - **`journal`** — signals from the reflective journal and their mood. **Off by
 *    default.**
 *
 * Collapsing them into a single "personalise" toggle would mean that a reader who
 * is happy to have their lesson progress remembered has to also consent to their
 * mood being read. That is not consent, it is a bundle, and the brief forbids it.
 *
 * ## The rule this module enforces
 *
 * **No signal linked to an identity is sent without consent for its own switch.**
 * Not "de-identified and sent anyway" — not sent. A guest's signals may be counted
 * for the session in memory, but they are never written against a uid, because
 * attaching them later is the same disclosure with extra steps.
 *
 * ## The kill switch
 *
 * An admin can turn signals off globally, and a reader can pause theirs. Both are
 * checked here so there is exactly one place that decides, and it fails **closed**:
 * an unreadable consent document means no signals.
 */

import type { ConsentSwitch, Signal } from "./types";

export interface ConsentState {
  conversation: boolean;
  journal: boolean;
  /** Epoch ms until which the reader has paused. Absent means not paused. */
  pausedUntil?: number;
  updatedAt?: number;
}

export interface GlobalSwitch {
  /** False kills signal collection for every reader. */
  signalsEnabled: boolean;
  /** False kills memory injection into prompts, without stopping counting. */
  memoryEnabled: boolean;
}

export const DEFAULT_CONSENT: ConsentState = {
  conversation: false,
  journal: false,
};

export const DEFAULT_GLOBAL: GlobalSwitch = {
  signalsEnabled: true,
  memoryEnabled: true,
};

/**
 * Why a signal may not be sent.
 *
 * Returned rather than a bare boolean so the caller can distinguish "the reader
 * said no" from "we could not tell", which are different things to log and one of
 * which is a bug.
 */
export type BlockReason =
  | "global_off"
  | "paused"
  | "no_identity"
  | "switch_off"
  | "unreadable_consent";

export type ConsentDecision =
  | { allowed: true }
  | { allowed: false; reason: BlockReason };

/**
 * Whether one signal may be sent.
 *
 * Order matters and is deliberate:
 *
 *  1. **Global first.** If the admin has killed signals, nothing is evaluated —
 *    including identity — so no per-reader bookkeeping happens at all.
 *  2. **Pause next.** A pause is a deliberate act and outranks everything except
 *    the global switch.
 *  3. **Identity next.** No identity means no identified signal, full stop.
 *  4. **The switch last**, because it is the one that can legitimately be false.
 *
 * `consent === null` fails closed. An unreadable or absent consent document is not
 * permission; treating it as permission would mean a Firestore blip silently turns
 * a refusing reader into a tracked one.
 */
export function decideSignal(
  signal: Pick<Signal, "consent" | "identified">,
  consent: ConsentState | null | undefined,
  global: GlobalSwitch,
  now: number = Date.now()
): ConsentDecision {
  if (!global.signalsEnabled) return { allowed: false, reason: "global_off" };

  const pause = consent?.pausedUntil;
  if (typeof pause === "number" && pause > now) {
    return { allowed: false, reason: "paused" };
  }

  if (!signal.identified) return { allowed: false, reason: "no_identity" };

  if (!consent) return { allowed: false, reason: "unreadable_consent" };

  if (!consent[signal.consent]) return { allowed: false, reason: "switch_off" };

  return { allowed: true };
}

/** The default state of the two switches, for the consent screen. */
export function defaultConsent(): ConsentState {
  return { ...DEFAULT_CONSENT };
}

/**
 * The plain-language description of what each switch authorises.
 *
 * Shown verbatim on the consent screen. It exists here rather than in the
 * component because the wording is a commitment, and a commitment should not be
 * edited in a JSX file where nobody will notice.
 */
export const CONSENT_COPY_AR: Record<ConsentSwitch, { title: string; body: string; risk: string }> = {
  conversation: {
    title: "التخصيص من محادثاتك وتتبّعك",
    body:
      "نتذكّر الفيلسوف الذي اخترته، وموضوعات أسئلتك، والدروس التي أنهيتها، " +
      "والعادات التي التزمت بها. نستخدم ذلك لنقترح لك الخطوة التالية.",
    risk: "لا نقرأ نصّ أسئلتك، ولا نحفظ ضغطات المفاتيح، ولا حركة الفأرة.",
  },
  journal: {
    title: "التخصيص من مفكرتك ومزاجك",
    body:
      "نقرأ ما كتبته في مفكرتك، وتقييم مزاجك، لألخّص لك أسبوعك.",
    risk:
      "مطفأ افتراضياً. إن أطفأته، لا يُقرأ من مفكرتك شيء على الخادم، " +
      "ولا يُذكر مزاجك في أي ملخّص.",
  },
};

/** Used by the test that asserts the copy never promises something untrue. */
export const CONSENT_NEVER_PROMISES = [
  "نشاهد",
  "نراقب",
  "نعرف عنك",
  "استنتاج",
] as const;
