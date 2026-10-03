"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PERSONAS } from "@/lib/ai/personas";
import { consumeDialogue, readDialogueError } from "@/lib/dialogue-client";
import { Markdown } from "@/components/Markdown";
import { PersonaCards } from "@/components/PersonaCards";
import { useAppStore } from "@/lib/store";
import { useSession } from "@/lib/session";

/**
 * `/dialogue` — two philosophers answer the same question, three rounds, then a
 * neutral summary.
 *
 * What the server owns, and this file deliberately does not:
 *  - how many rounds exist
 *  - whether the summary is produced
 *  - whether the reader is metered
 *
 * The client asks for a round and renders what comes back. If a non-member asks
 * for round two they get `preview_end` from the server and an invitation on
 * screen — the client has no opinion on whether they are entitled, because a
 * client opinion is not evidence.
 */

interface Turn {
  personaId: string;
  text: string;
}

type Phase = "setup" | "running" | "summary" | "done";

export function Dialogue() {
  const { state: authState } = useSession();
  const attemptsLeft = useAppStore((s) => s.attemptsLeft);
  const setAttemptsLeft = useAppStore((s) => s.setAttemptsLeft);

  const [question, setQuestion] = useState("");
  const [picks, setPicks] = useState<[string, string] | null>(null);
  /** Which of the two slots is currently being assigned. */
  const [assigning, setAssigning] = useState<0 | 1>(0);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [summary, setSummary] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [interjection, setInterjection] = useState("");
  const [interjected, setInterjected] = useState(false);
  const [invited, setInvited] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const running = phase === "running" || phase === "summary";

  // Follow the newest turn, but only while the reader is already near the end.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns, summary]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const transcript = useCallback(
    () =>
      turns.map((t) => ({
        speaker: PERSONAS.find((p) => p.id === t.personaId)?.nameAr ?? t.personaId,
        content: t.text,
      })),
    [turns]
  );

  /**
   * Runs one round: both philosophers, sequentially, streamed by the server.
   *
   * `withInterjection` puts the reader's sentence into the transcript before the
   * round, so the philosophers answer it rather than talking past it.
   */
  const runRound = useCallback(
    async (round: number, picks: [string, string], withInterjection?: string) => {
      const base = transcript();
      if (withInterjection) {
        base.push({ speaker: "القارئ", content: withInterjection });
        setTurns((prev) => [...prev, { personaId: "__reader", text: withInterjection }]);
      }

      const controller = new AbortController();
      abortRef.current = controller;

      // Open both bubbles immediately so the layout does not jump when the first
      // token lands: the space is reserved, then filled.
      setTurns((prev) => [
        ...prev,
        { personaId: picks[0], text: "" },
        { personaId: picks[1], text: "" },
      ]);

      try {
        const res = await fetch("/api/dialogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "round",
            question,
            personas: picks,
            transcript: base,
            round,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await readDialogueError(res);
          setError(
            body?.code === "GATE"
              ? "انتهت محاولاتك المجانية. أنشئ حساباً لتكمل هذا الحوار."
              : (body?.error ?? "تعذّر بدء الحوار.")
          );
          return false;
        }

        const outcome = await consumeDialogue(
          res.body,
          {
            onTurnStart: (e) => {
              setError(null);
              // Clear the placeholder for whoever is opening, so their text
              // starts from empty rather than concatenating onto a stub.
              setTurns((prev) =>
                prev.map((t) => (t.personaId === e.personaId ? { ...t, text: "" } : t))
              );
            },
            onTurnDelta: (delta, personaId) => {
              setTurns((prev) =>
                prev.map((t) => (t.personaId === personaId ? { ...t, text: t.text + delta } : t))
              );
            },
            onQuota: (remaining) => setAttemptsLeft(remaining),
            onPreviewEnd: () => setInvited(true),
            onError: (message) => setError(message),
          },
          controller.signal
        );

        return outcome;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return false;
        setError("انقطع الاتصال. تحقّق من الشبكة ثم أعد المحاولة.");
        return false;
      } finally {
        abortRef.current = null;
      }
    },
    [question, setAttemptsLeft, transcript]
  );

  const runSummary = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("summary");

    try {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summary",
          question,
          transcript: transcript(),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await readDialogueError(res);
        setError(body?.error ?? "تعذّر إعداد الخلاصة.");
        setPhase("done");
        return;
      }

      await consumeDialogue(
        res.body,
        {
          onSummaryDelta: (delta) => setSummary((prev) => prev + delta),
          onQuota: (remaining) => setAttemptsLeft(remaining),
          onError: (message) => setError(message),
        },
        controller.signal
      );
      setPhase("done");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError("انقطع الاتصال أثناء الخلاصة.");
      }
      setPhase("done");
    } finally {
      abortRef.current = null;
    }
  }, [question, setAttemptsLeft, transcript]);

  async function start() {
    if (!picks || question.trim().length < 3) return;
    setTurns([]);
    setSummary("");
    setInvited(false);
    setError(null);
    setInterjected(false);
    setPhase("running");

    const outcome = await runRound(1, picks);
    if (!outcome) {
      setPhase("setup");
      return;
    }

    if (outcome.previewEnded) {
      setInvited(true);
      setPhase("done");
      return;
    }

    await runRound(2, picks);
    await runRound(3, picks);
    await runSummary();
  }

  /** One sentence between rounds, then the dialogue carries on. */
  async function interject() {
    if (!picks || !interjection.trim()) return;
    const line = interjection.trim();
    setInterjection("");
    setInterjected(true);
    setPhase("running");

    await runRound(2, picks, line);
    await runRound(3, picks);
    await runSummary();
  }

  /* ── Setup ─────────────────────────────────────────────────────────────── */
  if (phase === "setup") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <header className="mb-8">
          <h1 className="display-arabic text-2xl font-bold text-gold-light">الحوار</h1>
          <p className="display-latin mt-1 text-xs tracking-[0.25em] text-gold-muted/45">
            DIALOGUE
          </p>
          <p className="display-arabic mt-4 leading-loose text-gold-muted">
            اسأل سؤالاً واحداً، واختر فيلسوفين ليجيبا عنه. سيتبادلان ثلاث جولات، ثم
            تأتي خلاصة محايدة تبيّن أين اتفقا وأين اختلفا.
          </p>
        </header>

        <label htmlFor="dialogue-question" className="display-arabic mb-2 block text-sm font-semibold text-gold-light">
          سؤالك
        </label>
        <textarea
          id="dialogue-question"
          dir="auto"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="هل الحرّية ممكنة، أم أنها أثر سببي لا أكثر؟"
          className="field w-full resize-y py-3"
        />

        <h2 className="display-arabic mb-3 mt-8 text-sm font-semibold text-gold-light">
          {picks ? `اختر ${assigning === 0 ? "الفلسوف الأول" : "الفلسوف الثاني"}` : "اختر الفيلسوفين"}
        </h2>

        <PersonaCards
          selectedId={picks ? picks[assigning] : "__none__"}
          onSelect={(id) => {
            setPicks((prev) => {
              if (!prev) return [id, PERSONAS.find((p) => p.id !== id)?.id ?? id];
              const next: [string, string] = [...prev];
              next[assigning] = id;
              // The same philosopher twice is not a dialogue, so the other slot
              // is moved rather than left in conflict.
              if (next[0] === next[1]) next[assigning === 0 ? 1 : 0] = PERSONAS.find(
                (p) => p.id !== id
              )!.id;
              return next;
            });
            if (picks) setAssigning(assigning === 0 ? 1 : 0);
          }}
        />

        {picks && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="display-arabic text-sm text-gold-muted">
              {PERSONAS.find((p) => p.id === picks[0])?.nameAr}{" "}
              <span aria-hidden="true">⇄</span>{" "}
              {PERSONAS.find((p) => p.id === picks[1])?.nameAr}
            </p>
            <button
              type="button"
              onClick={() => {
                setPicks(null);
                setAssigning(0);
              }}
              className="text-xs text-gold-muted/55 underline underline-offset-4 hover:text-gold-light"
            >
              تغيير
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="display-arabic mt-4 text-sm text-gold-light">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void start()}
          disabled={!picks || question.trim().length < 3}
          className="btn-gold mt-8 w-full py-4 disabled:opacity-40"
        >
          ابدأ الحوار
        </button>

        {authState !== "loading" && (
          <p className="display-arabic mt-4 text-center text-xs text-gold-muted/50">
            يمكنك قراءة جولة كاملة مجاناً قبل أن نطلب منك أي قرار.
          </p>
        )}
      </div>
    );
  }

  /* ── The dialogue ──────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-40 pt-8">
      <h1 className="display-arabic text-xl font-bold text-gold-light">الحوار</h1>
      <p dir="auto" className="display-arabic mt-2 text-sm leading-relaxed text-gold-muted">
        {question}
      </p>

      <div ref={logRef} className="mt-8 flex flex-col gap-6" data-phase={phase}>
        {turns.map((turn, i) => {
          if (turn.personaId === "__reader") {
            return (
              <article
                key={`reader-${i}`}
                dir="auto"
                className="rounded-2xl rounded-ee-sm bg-gold px-4 py-3 text-[0.95rem] leading-loose text-black"
              >
                {turn.text}
              </article>
            );
          }
          const persona = PERSONAS.find((p) => p.id === turn.personaId);
          const empty = !turn.text;
          return (
            <article key={`${turn.personaId}-${i}`} dir="auto">
              <h2 className="display-arabic mb-1.5 flex items-center gap-2 text-sm font-bold text-gold-light">
                <span aria-hidden="true">{persona?.symbol}</span>
                {persona?.nameAr}
              </h2>
              {empty ? (
                // Reserved height, so the arrival of the first token moves nothing.
                <div className="glass min-h-[3.5rem]" />
              ) : (
                <div className="glass px-4 py-3 text-[0.95rem] leading-loose text-gold-light">
                  <Markdown text={turn.text} />
                </div>
              )}
            </article>
          );
        })}

        {(phase === "summary" || summary) && (
          <section className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-4">
            <h2 className="display-arabic mb-2 text-sm font-bold text-gold-light">خلاصة</h2>
            {summary ? (
              <div dir="auto" className="text-[0.95rem] leading-loose text-gold-muted">
                <Markdown text={summary} />
              </div>
            ) : (
              <div className="min-h-[3.5rem]" />
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="display-arabic text-sm text-gold-light">
            {error}
          </p>
        )}
      </div>

      {running && (
        <p className="display-arabic mt-6 text-center text-xs text-gold-muted/60">
          {phase === "summary" ? "تُكتب الخلاصة…" : "يتناوبان…"}
        </p>
      )}

      {/* One sentence between rounds. */}
      {phase === "done" && !interjected && !invited && (
        <section className="mt-8 rounded-2xl border border-gold/15 p-4">
          <label
            htmlFor="dialogue-interject"
            className="display-arabic mb-2 block text-sm font-semibold text-gold-light"
          >
            لتتدخّل بين الجولات
          </label>
          <p className="display-arabic mb-3 text-xs leading-relaxed text-gold-muted/60">
            جملة واحدة. ستدخل في الحوار قبل الجولتين التاليتين.
          </p>
          <div className="flex items-end gap-2">
            <textarea
              id="dialogue-interject"
              dir="auto"
              rows={2}
              value={interjection}
              onChange={(e) => setInterjection(e.target.value)}
              className="field flex-1 resize-none py-2.5"
            />
            <button
              type="submit"
              form="interject-form"
              disabled={!interjection.trim()}
              className="btn-ghost px-5 py-3 text-sm disabled:opacity-35"
            >
              أدخل
            </button>
          </div>
          <form
            id="interject-form"
            onSubmit={(e) => {
              e.preventDefault();
              void interject();
            }}
          />
        </section>
      )}

      {/* The invitation the server asked for. */}
      {invited && (
        <section className="glass-strong mt-8 rounded-2xl p-6">
          <h2 className="display-arabic text-lg font-bold text-gold-light">
            انتهت الجولة المجانية
          </h2>
          <p className="display-arabic mt-3 leading-loose text-gold-muted">
            هذه جولة كاملة، بالمجّان. لو أردت الجولتين المتبقيتين والخلاصة، فأنشئ حساباً
            وستفتح لك أربعة عشر يوماً بلا حدود — بلا بطاقة، ولا تجديد.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setPhase("setup");
                setTurns([]);
                setSummary("");
                setInvited(false);
              }}
              className="btn-ghost flex-1 py-3 text-sm font-semibold"
            >
              اكتفِ بهذا
            </button>
            <Link href="/enter?mode=signup" className="btn-gold flex-1 py-3 text-center text-sm font-semibold">
              أنشئ حسابي — 14 يوماً مجاناً
            </Link>
          </div>
        </section>
      )}

      {attemptsLeft !== null && attemptsLeft < 5 && !invited && (
        <p role="status" className="display-arabic mt-6 text-center text-xs text-gold-muted/55">
          {attemptsLeft === 1
            ? "بقي لك سؤال مجاني واحد."
            : `بقي لك ${attemptsLeft} من الأسئلة المجانية.`}
        </p>
      )}
    </div>
  );
}

export default Dialogue;
