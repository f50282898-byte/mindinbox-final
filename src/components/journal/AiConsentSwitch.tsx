"use client";

/**
 * The AI consent switch.
 *
 * One switch, on its own, stated in plain words, with no bundle to opt out of and
 * no nudge attached. Three things it must never do, and this component is where
 * that is enforced:
 *
 *  1. **Not be pre-ticked.** `checked` reads the stored value, and that value
 *     defaults to false. There is no code path that can set it to true without the
 *     reader having pressed this control.
 *  2. **Not be bundled.** It sits alone, not inside a "personalise your
 *     experience" group alongside analytics. Bundling is how consent gets given
 *     without being noticed.
 *  3. **Not be quiet about the consequence.** Turning it on is the moment their
 *     journal becomes readable by a model, so the wording says so plainly and the
 *     switch says what turning it *off* does.
 *
 * Turning it **off** takes effect immediately and server-side: the gate is checked
 * before any read is issued (see `ai-consent.ts`), so there is no window in which
 * a request is in flight and the consent was withdrawn.
 */

import { useState } from "react";
import { useJournal } from "@/lib/journal/store";

export function AiConsentSwitch() {
  const consent = useJournal((s) => s.settings.aiJournalConsent);
  const updateSettings = useJournal((s) => s.updateSettings);
  const [confirming, setConfirming] = useState(false);

  return (
    <section
      aria-labelledby="ai-consent-title"
      className="glass mb-6 border-gold/25 p-5"
    >
      <h2 id="ai-consent-title" className="display-arabic mb-1 text-sm font-semibold text-gold-light">
        هل يقرأ الذكاء مفكرتك؟
      </h2>

      <p className="display-arabic mb-4 text-xs leading-loose text-gold-muted/60">
        {consent ? (
          <>
            نعم، ما تكتبه في «صفحة حرة» وسؤال اليوم ومتابعة مزاجك يمكن أن يُقرأ لتلخيص
            أسبوعك. يمكنك إيقاف ذلك في أي وقت، ويُوقف فوراً.
          </>
        ) : (
          <>
            لا. لا يقرأ الذكاء أي شيء كتبته هنا — لا نصّك، ولا مزاجك، ولا تقييماتك. كل ما
            تراه في هذه الصفحة يبقى على جهازك.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={consent}
          onClick={() => {
            // Turning on asks once, because this is the irreversible-feeling half.
            if (!consent) {
              setConfirming(true);
              return;
            }
            updateSettings({ aiJournalConsent: false });
            setConfirming(false);
          }}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
            consent ? "border-gold/60 bg-gold/30" : "border-gold/25 bg-transparent"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 size-4 rounded-full transition-all ${
              consent ? "start-7 bg-gold" : "start-1 bg-gold-muted/60"
            }`}
          />
          <span className="sr-only">{consent ? "مفعّل" : "غير مفعّل"}</span>
        </button>

        <span className="display-arabic text-xs font-semibold text-gold-light">
          {consent ? "مفعّل" : "غير مفعّل"}
        </span>
      </div>

      {confirming && !consent && (
        <div className="glass-strong mt-4 rounded-xl p-4">
          <p className="display-arabic text-xs leading-loose text-gold-light">
            إن فعّلته، سيقرأ الذكاء نصوص «صفحة حرة» وسؤال اليوم وتقييم مزاجك ليُعدّ
            ملخّص أسبوعك. لن يُفصح عن اسمك، ولن يُستخدم في شيء آخر.
          </p>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn-ghost flex-1 px-4 py-2.5 text-xs font-semibold"
            >
              اتركه off
            </button>
            <button
              type="button"
              onClick={() => {
                updateSettings({ aiJournalConsent: true });
                setConfirming(false);
              }}
              className="btn-gold flex-1 px-4 py-2.5 text-xs font-semibold"
            >
              فعّله
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default AiConsentSwitch;
