"use client";

import { FREE_INTERACTIONS } from "@/lib/quota";

/**
 * Quiet quota indicator.
 *
 * "Quiet" is the requirement, and it is a design constraint rather than a
 * styling one:
 *  - no countdown, no progress bar that drains, no colour change as it falls.
 *    A meter that visibly empties manufactures anxiety, and the product's voice
 *    is calm.
 *  - it appears only once it is worth mentioning. A visitor who has used none of
 *    the allowance has nothing to be told.
 *  - the copy states a fact and stops. No "use it before you lose it".
 *  - the last one is stated plainly rather than dressed up, because pretending
 *    otherwise is worse than the fact.
 */
export function QuotaMeter({
  remaining,
  isMember,
  loading,
}: {
  remaining: number | null;
  isMember: boolean;
  loading: boolean;
}) {
  // A paying member is not metered, so there is nothing to report.
  if (isMember) return null;

  // Nothing to say until the allowance is actually in play.
  if (remaining === null) return null;
  if (remaining >= FREE_INTERACTIONS) return null;

  const last = remaining === 1;

  return (
    <p
      // `status` so a screen reader announces the change without stealing focus.
      role="status"
      aria-live="polite"
      className="display-arabic text-center text-xs text-gold-muted/55"
    >
      {loading ? (
        "جارٍ التحقق من محاولاتك…"
      ) : last ? (
        "بقي لك سؤال مجاني واحد."
      ) : (
        `بقي لك ${remaining} من الأسئلة المجانية.`
      )}
    </p>
  );
}

export default QuotaMeter;
