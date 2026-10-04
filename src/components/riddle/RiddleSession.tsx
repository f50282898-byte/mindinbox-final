"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { useSession } from "@/lib/session";
import { Turnstile } from "@/components/Turnstile";
import { GoldenToken, usePrefersReducedMotion } from "@/components/riddle/GoldenToken";

/**
 * The riddle session.
 *
 * ## What the client knows, and what it must not
 *
 * The client learns one of two things from `/roll`: "not this time", or "you have a
 * token". It never learns the probability, the budget, or which guard stopped it —
 * `/roll` maps every refusal to the same flat response for exactly this reason.
 *
 * It also never learns the acceptance list. `/open` returns the prompt and the
 * guidance; grading happens in `/answer`, on the server, against data that has never
 * been serialised downward. `scripts/check-no-riddle-leak.mjs` fails the build if any
 * of it ever appears in a chunk or in a prerendered page.
 *
 * ## One roll per page load
 *
 * `rolledRef` guards the effect. Without it, React's double-invocation of effects in
 * development would draw twice, and a reader who reloaded in a loop would spend their
 * hourly allowance without noticing.
 */

type Phase = "idle" | "rolling" | "token" | "challenge" | "playing" | "solved" | "failed";

interface RiddleView {
  id: string;
  philosopherAr: string;
  promptAr: string;
  guidanceAr: string;
}

export function RiddleSession() {
  const { state } = useSession();
  const reducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [challengeReset, setChallengeReset] = useState(0);
  const [riddle, setRiddle] = useState<RiddleView | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [prizeNote, setPrizeNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rolledRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const bearer = useCallback(async (): Promise<string | null> => {
    const user = auth?.currentUser;
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, []);

  /* ── The roll, once per page load ─────────────────────────────────────────── */
  useEffect(() => {
    if (state !== "member" || rolledRef.current) return;
    rolledRef.current = true;

    // Checked here as well as on the server. This is a courtesy that saves a request,
    // not a control — the server refuses an unverified account regardless, and a
    // reader who clears this check by editing the bundle learns nothing.
    if (!auth?.currentUser?.emailVerified) return;

    let cancelled = false;
    setPhase("rolling");

    void (async () => {
      const idToken = await bearer();
      if (!idToken || cancelled) return;

      try {
        const res = await fetch("/api/riddle/roll", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { won?: boolean; token?: string };
        if (data.won === true && typeof data.token === "string") {
          setToken(data.token);
          setPhase("token");
        }
        // A loss is silence. There is nothing to say, and saying so would imply a
        // frequency that is not ours to publish.
      } catch {
        // Offline or a blocked request. Nothing is shown; the next visit rolls again.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state, bearer]);

  /* ── Move focus into the dialog, so a keyboard reader is not stranded ──────── */
  useEffect(() => {
    if (phase === "challenge" || phase === "playing" || phase === "solved") {
      dialogRef.current?.focus();
    }
  }, [phase]);

  const close = useCallback(() => {
    setPhase("idle");
    setToken(null);
    setRiddle(null);
    setAnswer("");
    setFeedback(null);
    setResolution(null);
    setPrizeNote(null);
    setTurnstileToken(null);
  }, []);

  /* ── Redeem: Turnstile first, then the riddle ─────────────────────────────── */
  const openRiddle = useCallback(async () => {
    if (!token || !turnstileToken) return;
    setBusy(true);
    setPhase("playing");
    setFeedback(null);

    const idToken = await bearer();
    if (!idToken) {
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/riddle/open", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token, turnstileToken }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase("challenge");
        setChallengeReset((n) => n + 1);
        setFeedback(
          data.error === "already_used"
            ? "هذا الرمز استُعمل من قبل."
            : "تعذّر فتح اللغز الآن. حاول بعد قليل."
        );
        return;
      }

      const data = (await res.json()) as {
        riddle: RiddleView;
        attemptsLeft: number;
      };
      setRiddle(data.riddle);
      setAttemptsLeft(data.attemptsLeft);
    } catch {
      setPhase("challenge");
      setFeedback("تعذّر فتح اللغز الآن.");
    } finally {
      setBusy(false);
    }
  }, [token, turnstileToken, bearer]);

  /* ── Submit ───────────────────────────────────────────────────────────────── */
  const submit = useCallback(async () => {
    if (!token || !riddle || answer.trim().length === 0 || busy) return;
    setBusy(true);
    setFeedback(null);

    const idToken = await bearer();
    if (!idToken) {
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/riddle/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token, answer }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "no_attempts_left") {
          setPhase("failed");
          setFeedback("انتهت المحاولات. سيبرد هذا اللغز، ويمكنك أن تعود إلى غيره.");
        } else {
          setFeedback("تعذّر التحقق من الجواب الآن.");
        }
        return;
      }

      const data = (await res.json()) as {
        passed: boolean;
        reasonAr?: string;
        resolutionAr?: string;
        attemptsLeft?: number;
        prize?: { tier: string; days: number } | null;
        prizeUnavailable?: boolean;
      };

      if (data.passed) {
        setPhase("solved");
        setResolution(data.resolutionAr ?? "");
        if (data.prize) {
          setPrizeNote(`فُتح لك ${data.prize.days} أيام في Oracle.`);
        } else if (data.prizeUnavailable) {
          setPrizeNote("أجبتَ بصح، لكن ميزانية الجوائز لهذا اليوم قد انتهت.");
        }
        return;
      }

      setFeedback(data.reasonAr ?? "لم يصل الجواب إلى شيء.");
      if (typeof data.attemptsLeft === "number") {
        setAttemptsLeft(data.attemptsLeft);
        if (data.attemptsLeft <= 0) setPhase("failed");
      }
    } catch {
      setFeedback("تعذّر التحقق من الجواب الآن.");
    } finally {
      setBusy(false);
    }
  }, [token, riddle, answer, busy, bearer]);

  const dialogOpen =
    phase === "challenge" || phase === "playing" || phase === "solved" || phase === "failed";

  return (
    <>
      {phase === "token" && (
        <GoldenToken reducedMotion={reducedMotion} onActivate={() => setPhase("challenge")} />
      )}

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={(event) => {
            // Backdrop click closes only before an attempt is spent, so a reader
            // cannot lose a try to a stray tap.
            if (event.target === event.currentTarget && phase === "challenge") close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="riddle-title"
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface-solid p-6 shadow-2xl outline-none"
          >
            <h2 id="riddle-title" className="display-arabic text-lg text-gold-light">
              {riddle ? riddle.philosopherAr : "رمز غامض"}
            </h2>

            {phase === "challenge" && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gold-muted">
                  هذا الرمز يفتح لغزاً واحداً. يتأكد أولاً أنك لست برنامجاً.
                </p>
                {feedback && (
                  <p role="alert" className="text-sm text-gold-light">
                    {feedback}
                  </p>
                )}
                <Turnstile onToken={setTurnstileToken} resetSignal={challengeReset} />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openRiddle}
                    disabled={!turnstileToken || busy}
                    className="rounded-lg border border-accent-solid/60 px-4 py-2 text-sm text-accent-solid disabled:opacity-40"
                  >
                    {busy ? "جارٍ الفتح…" : "افتح اللغز"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gold-muted"
                  >
                    اتركه
                  </button>
                </div>
              </div>
            )}

            {phase === "playing" && riddle && (
              <div className="mt-4 space-y-4">
                <p className="display-arabic text-md leading-8 text-gold-light">{riddle.promptAr}</p>
                <p className="text-xs text-gold-muted/70">{riddle.guidanceAr}</p>

                <label htmlFor="riddle-answer" className="block text-xs text-gold-muted">
                  جوابك
                </label>
                <textarea
                  id="riddle-answer"
                  dir="auto"
                  rows={4}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 p-3 text-sm text-gold-light outline-none focus:border-accent-solid/60"
                />

                {feedback && (
                  <p role="status" className="text-sm text-gold-light">
                    {feedback}
                  </p>
                )}

                <p className="text-xs text-gold-muted/60">
                  بقيت {attemptsLeft} {attemptsLeft === 1 ? "محاولة" : "محاولات"}.
                </p>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || answer.trim().length === 0}
                    className="rounded-lg border border-accent-solid/60 px-4 py-2 text-sm text-accent-solid disabled:opacity-40"
                  >
                    {busy ? "جارٍ التحقق…" : "تحقّق"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gold-muted"
                  >
                    اتركه
                  </button>
                </div>
              </div>
            )}

            {phase === "solved" && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-accent-solid">أصبت.</p>
                {resolution && (
                  <p className="display-arabic text-sm leading-8 text-gold-light">{resolution}</p>
                )}
                {prizeNote && <p className="text-sm text-gold-light">{prizeNote}</p>}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gold-muted"
                >
                  إغلاق
                </button>
              </div>
            )}

            {phase === "failed" && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gold-light">
                  {feedback ?? "انتهت المحاولات على هذا اللغز."}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gold-muted"
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
