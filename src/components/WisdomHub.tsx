"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ChevronDown, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAppStore } from "@/lib/store";
import { PHILOSOPHERS, getPhilosopher } from "@/lib/ai";
import { FREE_ATTEMPT_LIMIT } from "@/lib/anon-session";
import { useSession } from "@/lib/session";

interface Bubble {
  id: string;
  role: "user" | "model";
  content: string;
  /** Which provider answered, for a discreet footnote. */
  via?: string;
  philosopher?: string;
}

const GREETING =
  "أهلاً بك في عقل في صندوق. أنا حكيمك. اختر من أنا سأكون، ثم اسأل — ولن أُجيبك بما تريد سماعه، بل بما يحتمل أن تحتاجه.";

/**
 * "Ask the Wise" — the primary AI surface.
 *
 * Transport is a plain `fetch` to `/api/ai` (no SDK, no Node built-ins), and
 * the free-tier limit is enforced by the server. The client only mirrors the
 * remaining count for instant feedback; it is not the control.
 */
export function WisdomHub() {
  const [bubbles, setBubbles] = useState<Bubble[]>([{ id: "intro", role: "model", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const philosopherId = useAppStore((s) => s.philosopherId);
  const setPhilosopher = useAppStore((s) => s.setPhilosopher);
  const setAttemptsLeft = useAppStore((s) => s.setAttemptsLeft);
  const openGate = useAppStore((s) => s.openGate);
  const attemptsLeft = useAppStore((s) => s.attemptsLeft);
  const tier = useAppStore((s) => s.tier);

  const { state } = useSession();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const philosopher = getPhilosopher(philosopherId);
  const isMember = tier === "oracle" || tier === "sanctum";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, thinking]);

  // Warn before the Gate appears rather than failing at zero.
  useEffect(() => {
    if (attemptsLeft === null || isMember) return;
    if (attemptsLeft === 1) setError("هذه آخر محاولة مجانية. المحاولة التالية تفتح البوابة.");
    else if (attemptsLeft === 2) setError("لديك محاولتان مجانيتان متبقيتان.");
  }, [attemptsLeft, isMember]);

  const send = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const text = draft.trim();
      if (!text || thinking) return;

      setError(null);
      setDraft("");
      setBubbles((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
      setThinking(true);

      try {
        const history = bubbles
          .filter((b) => b.id !== "intro")
          .map((b) => ({ role: b.role === "user" ? "user" : "model", content: b.content }));

        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...history, { role: "user", content: text }],
            philosopherId,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          text?: string;
          via?: string;
          code?: string;
          error?: string;
          remaining?: number | null;
          philosopher?: { name: string };
        };

        if (typeof data.remaining === "number") setAttemptsLeft(data.remaining);

        if (data.ok && data.text) {
          setBubbles((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "model",
              content: data.text!,
              via: data.via,
              philosopher: data.philosopher?.name,
            },
          ]);
        } else if (data.code === "gate") {
          setError(data.error ?? "استنفدت المحاولات المجانية.");
          openGate();
        } else {
          setError(data.error ?? "تشوّشت الرؤية. حاول مرة أخرى.");
        }
      } catch {
        setError("انقطع الاتصال. تحقّق من الشبكة ثم أعد المحاولة.");
      } finally {
        setThinking(false);
      }
    },
    [bubbles, draft, philosopherId, setAttemptsLeft, openGate, thinking]
  );

  const exhausted = !isMember && attemptsLeft !== null && attemptsLeft <= 0;

  return (
    <div className="relative flex min-h-screen flex-col">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 void-vignette -z-10" />

      {/* ── Header: identity + persona picker ── */}
      <header className="sticky top-0 z-20 border-b border-gold/10 bg-volcanic/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <h1 className="gold-text-glow display-arabic truncate text-xl font-bold text-gold-light sm:text-2xl">
              اسأل الحكيم
            </h1>
            <p className="display-latin mt-0.5 truncate text-[11px] tracking-[0.25em] text-gold-muted/50">
              ASK THE WISE
            </p>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              className="btn-ghost gap-2 py-2.5 text-sm"
            >
              <Sparkles className="size-4" />
              <span className="hidden sm:inline">{philosopher.name}</span>
              <ChevronDown
                className={`size-3.5 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {pickerOpen && (
                <>
                  <button
                    type="button"
                    aria-label="إغلاق القائمة"
                    onClick={() => setPickerOpen(false)}
                    className="fixed inset-0 z-30 h-full w-full cursor-default"
                  />
                  <motion.ul
                    role="listbox"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    className="glass-strong absolute end-0 z-40 mt-2 w-72 overflow-hidden rounded-2xl"
                  >
                    {PHILOSOPHERS.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={p.id === philosopherId}
                          onClick={() => {
                            setPhilosopher(p.id);
                            setPickerOpen(false);
                          }}
                          className={`block w-full px-4 py-3 text-start transition-colors hover:bg-gold/10 ${
                            p.id === philosopherId ? "bg-gold/10" : ""
                          }`}
                        >
                          <span className="display-arabic flex items-baseline gap-2 text-base text-gold-light">
                            {p.name}
                            <span className="display-latin text-[10px] tracking-widest text-gold-muted/50">
                              {p.latin}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-gold-muted/65">
                            {p.epithet} · {p.years}
                          </span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Allowance meter — honest about who is metered */}
        {!isMember && (
          <div className="mx-auto max-w-4xl px-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 gap-1">
                {Array.from({ length: FREE_ATTEMPT_LIMIT }).map((_, index) => {
                  const spent =
                    attemptsLeft === null ? false : index >= attemptsLeft;
                  return (
                    <span
                      key={index}
                      className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                        spent ? "bg-gold/15" : "bg-gold shadow-[0_0_6px_rgba(212,175,55,0.7)]"
                      }`}
                    />
                  );
                })}
              </div>
              <span className="shrink-0 text-[10px] tracking-widest text-gold-muted/50">
                {state === "loading"
                  ? "…"
                  : attemptsLeft === null
                    ? `${FREE_ATTEMPT_LIMIT} محاولات مجانية`
                    : `${attemptsLeft} متبقية`}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* ── Transcript ──
          Anchored to the bottom so a short conversation reads as settled
          above the composer rather than stranded at the top of a tall void. */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-end gap-6 px-5 py-8">
        <AnimatePresence initial={false}>
          {bubbles.map((bubble) => (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`flex ${bubble.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[86%] rounded-2xl px-5 py-4 text-[15px] leading-loose sm:max-w-[78%] ${
                  bubble.role === "user"
                    ? "rounded-ee-sm bg-gold text-black"
                    : "gold-frame display-arabic rounded-es-sm bg-[#0A0A0A]/80 text-gold-light backdrop-blur-xl"
                }`}
              >
                <p className="whitespace-pre-wrap">{bubble.content}</p>
                {bubble.via && (
                  <p className="display-latin mt-3 text-[9px] tracking-[0.25em] text-gold-muted/40">
                    {bubble.philosopher ?? ""} · via {bubble.via}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {thinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="gold-frame display-arabic rounded-2xl rounded-es-sm bg-[#0A0A0A]/80 px-5 py-4 text-gold-muted backdrop-blur-xl">
              <span className="inline-flex items-center gap-1.5">
                يتأمّل
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1 rounded-full bg-gold"
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.18 }}
                    />
                  ))}
                </span>
              </span>
            </div>
          </motion.div>
        )}

        <div ref={endRef} />
      </div>

      {/* ── Composer ── */}
      <div className="sticky bottom-0 z-20 border-t border-gold/10 bg-volcanic/85 px-5 py-4 backdrop-blur-xl pb-safe">
        <div className="mx-auto max-w-4xl">
          {error && (
            <p role="status" className="mb-3 text-center text-xs text-gold/75">
              {error}
            </p>
          )}

          <form onSubmit={send} className="flex items-end gap-3">
            <label htmlFor="wisdom-input" className="sr-only">
              اسأل الحكيم
            </label>
            <textarea
              id="wisdom-input"
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={exhausted || thinking}
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={
                exhausted ? "سجّل الدخول لفتح الحكمة" : "اطرح سؤالك الفلسفي…"
              }
              className="field max-h-40 flex-1 resize-none py-3.5 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={exhausted || thinking || !draft.trim()}
              aria-label="أرسل"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold text-black transition-transform duration-300 hover:scale-105 disabled:pointer-events-none disabled:opacity-35"
            >
              <ArrowUp className="size-5" />
            </button>
          </form>

          {exhausted && (
            <button
              type="button"
              onClick={openGate}
              className="btn-gold mt-3 w-full py-3"
            >
              <span>افتح البوابة — أربعة عشر يوماً مجاناً</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}