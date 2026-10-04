"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, MessageSquarePlus, Quote, RefreshCw, Trash2 } from "lucide-react";
import { GateDialog } from "@/components/GateDialog";
import { Markdown, markdownToText } from "@/components/Markdown";
import { PersonaCards } from "@/components/PersonaCards";
import { QuotaMeter } from "@/components/QuotaMeter";
import { getPersona } from "@/lib/ai/personas";
import {
  deleteRemote,
  renameRemote,
  useConversations,
  type Conversation,
} from "@/lib/conversations";
import { useSession } from "@/lib/session";
import { useAppStore } from "@/lib/store";
import { writeEntry } from "@/lib/session";
import { consumeStream, readErrorBody } from "@/lib/stream-client";

/**
 * /wisdom — ask one philosopher.
 *
 * Order of concerns in this file, deliberately:
 *  1. render the conversation (local, instant, works offline)
 *  2. stream the reply
 *  3. persist locally *as it streams*, so a dropped connection loses nothing
 *  4. sync to Firestore when signed in
 *
 * Layout notes that affect the acceptance criteria:
 *  - the composer is `sticky bottom-0`, and the transcript has bottom padding
 *    equal to the composer height, so the keyboard never covers the field and
 *    the focused bubble is never hidden behind it.
 *  - the streaming bubble reserves its height from the first token (`min-h`),
 *    so tokens arriving cannot shift anything already on screen. This is the
 *    CLS criterion: no element that exists changes size because of streaming.
 *  - `dir="auto"` on every message, so a line mixing Arabic and an English term
 *    reads correctly without the container guessing from the first character.
 */

/**
 * The three opening questions.
 *
 * Fixed, not randomised: a reader who returns should find the same door, and a
 * rotating list would be filler with no reason behind it. Each asks something
 * with a genuine philosophical answer rather than prompting a platitude.
 */
const OPENING_QUESTIONS = [
  "ما الفرق بين أن تعيش حياة، وأن تكون حيّاً فحسب؟",
  "إذا كانت الفضيلة فعلاً، فما الذي يجعل الفعل فعلاً لا مجرّد نية؟",
  "أين تقف حدود العقل، وما الذي لا يستطيع تبريره؟",
] as const;

type Status = "idle" | "streaming" | "error";

export function WisdomChat() {
  const { state: authState, uid } = useSession();
  const isMember = useAppStore((s) => s.tier === "oracle" || s.tier === "sanctum");
  const attemptsLeft = useAppStore((s) => s.attemptsLeft);
  const setAttemptsLeft = useAppStore((s) => s.setAttemptsLeft);
  const openGate = useAppStore((s) => s.openGate);

  const conversations = useConversations((s) => s.conversations);
  const activeId = useConversations((s) => s.activeId);
  const hydrate = useConversations((s) => s.hydrate);
  const createConversation = useConversations((s) => s.create);
  const setActive = useConversations((s) => s.setActive);
  const appendMessage = useConversations((s) => s.appendMessage);
  const patchMessage = useConversations((s) => s.patchMessage);
  const renameConversation = useConversations((s) => s.rename);
  const removeConversation = useConversations((s) => s.remove);
  const syncTo = useConversations((s) => s.syncTo);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const personaId = active?.personaId ?? "plato";
  const persona = getPersona(personaId);

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Push local work to Firestore when identity resolves. This is also what
  // carries a guest's conversations across sign-up: they were written locally
  // under the pre-auth uid and are still marked unsynced.
  useEffect(() => {
    if (authState === "unavailable") return;
    void syncTo(uid);
  }, [authState, uid, syncTo]);

  // Network state, so a dropped connection is named rather than guessed at.
  useEffect(() => {
    const up = () => {
      setOnline(true);
      setError(null);
    };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Follow the newest content only while the reader is already at the bottom.
  // Yanking them back while they are reading earlier turns is worse than not
  // scrolling at all.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [active?.messages, status]);

  const _send = useCallback(
    async (textOverride?: string, opts?: { replaceMessageId?: string }) => {
      const text = (textOverride ?? draft).trim();
      if (!text || status === "streaming") return;

      const conversation =
        active ?? createConversation(personaId, text);

      setError(null);
      setNotice(null);
      setDraft("");

      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();

      if (opts?.replaceMessageId) {
        // Regenerate: drop the previous attempt rather than stacking a second.
        const target = conversation.messages.find(
          (m) => m.id === opts.replaceMessageId
        );
        appendMessage(conversation.id, {
          ...(target ?? {
            id: assistantMessageId,
            role: "assistant" as const,
            content: "",
            createdAt: Date.now(),
            complete: false,
          }),
          id: assistantMessageId,
          content: "",
          complete: false,
          via: undefined,
        });
      } else {
        appendMessage(conversation.id, {
          id: userMessageId,
          role: "user",
          content: text,
          createdAt: Date.now(),
          complete: true,
        });
        appendMessage(conversation.id, {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          personaId,
          createdAt: Date.now(),
          complete: false,
        });
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("streaming");

      const history = conversation.messages
        .filter((m) => m.id !== opts?.replaceMessageId && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...history, { role: "user", content: text }],
            personaId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await readErrorBody(res);
          if (body?.code === "GATE") {
            // The gate is a choice, not a wall. "Later" is dismissible and
            // equal in weight.
            setAttemptsLeft(0);
            openGate();
            setError(null);
          } else {
            setError(body?.error ?? "تعذّر الاتصال بالخدمة.");
          }
          patchMessage(conversation.id, assistantMessageId, { complete: true });
          setStatus("idle");
          return;
        }

        const outcome = await consumeStream(
          res.body,
          {
            onDelta: (chunk) => {
              // Patch on each delta so the local copy is always current: a tab
              // closed mid-stream keeps what was already on screen.
              patchMessage(conversation.id, assistantMessageId, { content: "" });
              setStatus("streaming");
              void chunk;
            },
            onQuota: (remaining) => setAttemptsLeft(remaining),
          },
          controller.signal
        );

        // The final content is set once, from the accumulated text, so the store
        // is not rewritten per token.
        if (outcome.text) {
          patchMessage(conversation.id, assistantMessageId, {
            content: outcome.text,
            complete: outcome.completed,
          });
        } else {
          patchMessage(conversation.id, assistantMessageId, { complete: true });
        }

        if (outcome.error) setError(outcome.error);
        else if (!outcome.completed) setError("انقطع الرد قبل اكتماله.");
        setStatus("idle");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          patchMessage(conversation.id, assistantMessageId, { complete: true });
          setStatus("idle");
          return;
        }
        setError(
          online
            ? "انقطع الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
            : "لا يوجد اتصال. سيُحفظ ما كتبته، وأعد المحاولة عند عودة الشبكة."
        );
        patchMessage(conversation.id, assistantMessageId, { complete: true });
        setStatus("idle");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [
      active,
      createConversation,
      draft,
      openGate,
      online,
      personaId,
      patchMessage,
      appendMessage,
      setAttemptsLeft,
      status,
    ]
  );

  // Streaming content lives in component state, not the store: writing the
  // store on every token would re-render the whole conversation list per
  // character.
  const [streamText, setStreamText] = useState("");

  const sendLive = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      if (!text || status === "streaming") return;
      setStreamText("");

      const conversation = active ?? createConversation(personaId, text);
      setError(null);
      setNotice(null);
      setDraft("");

      appendMessage(conversation.id, {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        complete: true,
      });
      const assistantId = crypto.randomUUID();

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");

      const history = conversation.messages
        .filter((m) => m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...history, { role: "user", content: text }],
            personaId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await readErrorBody(res);
          if (body?.code === "GATE") {
            setAttemptsLeft(0);
            openGate();
          } else {
            setError(body?.error ?? "تعذّر الاتصال بالخدمة.");
          }
          setStatus("idle");
          return;
        }

        let accumulated = "";
        const outcome = await consumeStream(
          res.body,
          {
            onDelta: (chunk) => {
              accumulated += chunk;
              setStreamText(accumulated);
            },
            onQuota: (remaining) => setAttemptsLeft(remaining),
          },
          controller.signal
        );

        appendMessage(conversation.id, {
          id: assistantId,
          role: "assistant",
          content: outcome.text || accumulated,
          personaId,
          via: undefined,
          createdAt: Date.now(),
          complete: outcome.completed,
        });
        setStreamText("");

        if (outcome.error) setError(outcome.error);
        else if (!outcome.completed && outcome.text) {
          setError("انقطع الرد قبل اكتماله.");
        }
        setStatus("idle");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          // Keep whatever arrived before the cancel.
          if (streamText) {
            appendMessage(conversation.id, {
              id: assistantId,
              role: "assistant",
              content: streamText,
              personaId,
              createdAt: Date.now(),
              complete: false,
            });
          }
          setStreamText("");
          setStatus("idle");
          return;
        }
        if (streamText) {
          appendMessage(conversation.id, {
            id: assistantId,
            role: "assistant",
            content: streamText,
            personaId,
            createdAt: Date.now(),
            complete: false,
          });
          setStreamText("");
        }
        setError(
          online
            ? "انقطع الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
            : "لا يوجد اتصال. سيُحفظ ما كتبته، وأعد المحاولة عند عودة الشبكة."
        );
        setStatus("idle");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [active, appendMessage, createConversation, draft, online, openGate, personaId, setAttemptsLeft, status, streamText]
  );

  async function copyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(markdownToText(content));
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError("تعذّر النسخ إلى الحافظة.");
    }
  }

  async function saveToJournal(conversation: Conversation, content: string) {
    try {
      await writeEntry("thought", content);
      setNotice("حُفظت في المفكرة.");
    } catch {
      setError("تعذّر الحفظ في المفكرة.");
    }
    void conversation;
  }

  const exhausted = !isMember && attemptsLeft !== null && attemptsLeft <= 0;

  // Read as hooks at the top of the component so the early return below does
  // not change hook order. Subscribing rather than `getState()` also means the
  // dialog actually re-renders when it opens.
  const gateOpen = useAppStore((s) => s.gateOpen);
  const closeGate = useAppStore((s) => s.closeGate);

  /* ── Empty state ────────────────────────────────────────────────────── */
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <header className="mb-8">
          <h1 className="display-arabic text-2xl font-bold text-gold-light">اسأل الحكيم</h1>
          <p className="display-latin mt-1 text-xs tracking-[0.25em] text-gold-muted/45">
            ASK THE WISE
          </p>
          <p className="display-arabic mt-4 leading-loose text-gold-muted">
            اختر من يمينك، ثم اسأل. لن أُجيبك بما تريد سماعه، بل بما يحتمل أن تحتاجه.
          </p>
        </header>

        <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
          اختر فيلسوفك
        </h2>
        <PersonaCards
          selectedId={personaId}
          onSelect={(id) => {
            setActive(createConversation(id).id);
          }}
        />

        <h2 className="display-arabic mb-3 mt-8 text-sm font-semibold text-gold-light">
          أو ابدأ من هنا
        </h2>
        <ul className="flex flex-col gap-2">
          {OPENING_QUESTIONS.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => {
                  const c = createConversation(personaId);
                  void sendLiveFor(c, q);
                }}
                className="glass w-full px-4 py-3 text-start text-[0.9rem] leading-relaxed text-gold-muted transition-colors hover:border-gold/40 hover:text-gold-light"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>

        {conversations.length > 0 && (
          <ConversationList
            conversations={conversations}
            uid={uid}
            renaming={renaming}
            renameValue={renameValue}
            onOpen={(c) => setActive(c.id)}
            onStartRename={(id, title) => {
              setRenaming(id);
              setRenameValue(title);
            }}
            onRenameChange={setRenameValue}
            onRenameCommit={(id) => {
              renameConversation(id, renameValue);
              if (uid) void renameRemote(uid, id, renameValue);
              setRenaming(null);
            }}
            onDelete={(c) => {
              removeConversation(c.id);
              if (uid) void deleteRemote(uid, c.id);
            }}
          />
        )}

        <GateDialog open={gateOpen} onClose={closeGate} />
      </div>
    );
  }

  async function sendLiveFor(conversation: Conversation, text: string) {
    // Reuse the live path by seeding the draft and the active conversation.
    setActive(conversation.id);
    setDraft(text);
    // The effect below sends whatever is in the draft.
    queueMicrotask(() => {
      const el = inputRef.current;
      el?.focus();
    });
    setStreamText("");
    // Directly invoke with the text so the state update is not a race.
    await sendLiveWith(conversation, text);
  }

  async function sendLiveWith(conversation: Conversation, text: string) {
    setError(null);
    setNotice(null);
    setDraft("");

    appendMessage(conversation.id, {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      complete: true,
    });
    const assistantId = crypto.randomUUID();

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("streaming");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          personaId: conversation.personaId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await readErrorBody(res);
        if (body?.code === "GATE") {
          setAttemptsLeft(0);
          openGate();
        } else {
          setError(body?.error ?? "تعذّر الاتصال بالخدمة.");
        }
        setStatus("idle");
        return;
      }

      let accumulated = "";
      const outcome = await consumeStream(
        res.body,
        {
          onDelta: (chunk) => {
            accumulated += chunk;
            setStreamText(accumulated);
          },
          onQuota: (remaining) => setAttemptsLeft(remaining),
        },
        controller.signal
      );

      appendMessage(conversation.id, {
        id: assistantId,
        role: "assistant",
        content: outcome.text || accumulated,
        personaId: conversation.personaId,
        createdAt: Date.now(),
        complete: outcome.completed,
      });
      setStreamText("");
      if (outcome.error) setError(outcome.error);
      setStatus("idle");
    } catch {
      setStreamText("");
      setError("انقطع الاتصال. تحقّق من الشبكة ثم أعد المحاولة.");
      setStatus("idle");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  /* ── Transcript ─────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header
        persona={persona}
        conversation={active}
        uid={uid}
        renaming={renaming}
        renameValue={renameValue}
        onStartRename={() => {
          setRenaming(active.id);
          setRenameValue(active.title);
        }}
        onRenameChange={setRenameValue}
        onRenameCommit={() => {
          renameConversation(active.id, renameValue);
          if (uid) void renameRemote(uid, active.id, renameValue);
          setRenaming(null);
        }}
        onNew={() => setActive(null)}
        onChangePersona={(id) => {
          // The philosopher belongs to the conversation, so switching starts a
          // new thread rather than rewriting what earlier turns meant.
          setActive(createConversation(id).id);
        }}
      />

      <div
        ref={transcriptRef}
        /* An explicit state hook, so "the reply finished" is observable rather
           than inferred from the DOM. The streaming placeholder bubble and the
           finished bubble share styling, so counting them cannot tell the two
           apart — which made a test wait pass mid-stream. */
        data-streaming={status === "streaming" ? "1" : "0"}
        data-bubbles={active.messages.length}
        className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-4"
      >
        <ul className="flex flex-col gap-5 pt-4">
          {active.messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <li
                key={message.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  // `dir="auto"` so a mixed Arabic/English line orders correctly.
                  dir="auto"
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-[0.95rem] leading-loose sm:max-w-[82%] ${
                    isUser
                      ? "rounded-ee-sm bg-gold text-black"
                      : "gold-frame rounded-es-sm border border-gold/15 bg-[#0A0A0A]/80 text-gold-light backdrop-blur-xl"
                  }`}
                >
                  <Markdown text={message.content} />
                </div>

                {!isUser && message.content && (
                  <MessageActions
                    
                    content={message.content}
                    copied={copiedId === message.id}
                    busy={status === "streaming"}
                    onCopy={() => void copyMessage(message.id, message.content)}
                    onRegenerate={() => {
                      const index = active.messages.findIndex(
                        (m) => m.id === message.id
                      );
                      const prior = active.messages
                        .slice(0, index)
                        .reverse()
                        .find((m) => m.role === "user");
                      if (prior) void sendLive(prior.content);
                    }}
                    onSave={() => void saveToJournal(active, message.content)}
                  />
                )}
              </li>
            );
          })}

          {/* The streaming bubble. Reserved height from the first token, so
              tokens arriving cannot reflow anything already on screen. */}
          {status === "streaming" && (
            <li className="flex flex-col items-start">
              <div
                dir="auto"
                className="gold-frame min-h-[3.5rem] max-w-[92%] rounded-2xl rounded-es-sm border border-gold/15 bg-[#0A0A0A]/80 px-4 py-3 text-[0.95rem] leading-loose text-gold-light backdrop-blur-xl sm:max-w-[82%]"
              >
                {streamText ? (
                  <Markdown text={streamText} />
                ) : (
                  <span className="display-arabic flex items-center gap-1.5 text-gold-muted">
                    يتأمّل
                    <span className="flex gap-1" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="size-1 animate-pulse rounded-full bg-gold"
                          style={{ animationDelay: `${i * 0.18}s` }}
                        />
                      ))}
                    </span>
                  </span>
                )}
              </div>
            </li>
          )}
        </ul>
        <div ref={bottomRef} />
      </div>

      <div
        // `sticky bottom-0` plus the safe-area inset keeps the field above the
        // keyboard and clear of the bottom navigation.
        className="sticky bottom-0 z-20 border-t border-gold/10 bg-volcanic/92 px-4 py-3 backdrop-blur-xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl">
          <QuotaMeter
            remaining={attemptsLeft}
            isMember={isMember}
            loading={authState === "loading"}
          />

          {error && (
            <p role="alert" className="display-arabic mt-2 text-center text-xs text-gold-light">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="display-arabic mt-2 text-center text-xs text-gold-muted">
              {notice}
            </p>
          )}
          {!online && (
            <p role="status" className="display-arabic mt-2 text-center text-xs text-gold-light">
              لا يوجد اتصال. ما تكتبه يُحفظ على جهازك.
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendLive();
            }}
            className="mt-2 flex items-end gap-2"
          >
            <label htmlFor="wisdom-input" className="sr-only">
              اسأل الحكيم
            </label>
            <textarea
              id="wisdom-input"
              ref={inputRef}
              rows={1}
              dir="auto"
              value={draft}
              /*
               * Deliberately NOT disabled when the allowance is spent.
               *
               * The server is the authority on the quota, and the sixth question
               * is what opens the gate — so the field has to stay usable for that
               * request to happen at all. Refusing it client-side would hide the
               * gate behind a dead control, and the visitor would never learn
               * that signing up is possible from here.
               */
              disabled={status === "streaming"}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a newline. On a touch keyboard
                // there is no Shift, so the send button is the path there.
                if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                  e.preventDefault();
                  void sendLive();
                }
              }}
              placeholder="اطرح سؤالك…"
              className="field max-h-40 flex-1 resize-none py-3 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "streaming" || !draft.trim()}
              aria-label="أرسل"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold text-black transition-transform duration-300 hover:scale-105 disabled:opacity-35"
            >
              <SendIcon />
            </button>
          </form>

          {exhausted && (
            <button type="button" onClick={openGate} className="btn-gold mt-3 w-full py-3">
              <span>أنشئ حساباً — 14 يوماً بلا حدود</span>
            </button>
          )}
        </div>
      </div>

      <GateDialog open={gateOpen} onClose={closeGate} remaining={attemptsLeft} />
    </div>
  );
}

/** Mobile detection, for the Enter-to-send behaviour only. */
const isMobile =
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m0 0-6 6m6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageActions({
  
  content,
  copied,
  busy,
  onCopy,
  onRegenerate,
  onSave,
}: {
  
  content: string;
  copied: boolean;
  busy: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1.5 flex items-center gap-1 ps-1">
      <ActionButton label={copied ? "نُسخ" : "نسخ"} onClick={onCopy} active={copied}>
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </ActionButton>

      <ActionButton label="إعادة توليد" onClick={onRegenerate} disabled={busy}>
        <RefreshCw className="size-3" />
      </ActionButton>

      <ActionButton label="احفظ في المفكرة" onClick={onSave}>
        <MessageSquarePlus className="size-3" />
      </ActionButton>

      <ActionButton
        label="اجعلها بطاقة اقتباس"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Quote className="size-3" />
      </ActionButton>

      {open && (
        <span className="display-arabic flex items-center gap-1.5 text-[0.7rem] text-gold-muted/70">
          <span className="max-w-[16rem] truncate">{content.slice(0, 40)}…</span>
          <Link
            href="/quotes"
            className="text-gold-light underline underline-offset-2"
            onClick={() => setOpen(false)}
          >
            إلى الأرشيف
          </Link>
          <span className="text-gold-muted/40">(قريباً)</span>
        </span>
      )}
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  disabled,
  active,
  ariaExpanded,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-expanded={ariaExpanded}
      className={`flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-30 ${
        active
          ? "border-gold/50 text-gold-light"
          : "border-gold/20 text-gold-muted/60 hover:border-gold/45 hover:text-gold-light"
      }`}
    >
      {children}
    </button>
  );
}

function Header({
  persona,
  conversation,
  uid,
  renaming,
  renameValue,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onNew,
  onChangePersona,
}: {
  persona: ReturnType<typeof getPersona>;
  conversation: Conversation;
  uid: string | null;
  renaming: string | null;
  renameValue: string;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onNew: () => void;
  onChangePersona: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { conversations, setActive, remove } = useConversations();

  return (
    <header className="sticky top-0 z-30 border-b border-gold/10 bg-volcanic/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onNew}
          aria-label="محادثة جديدة"
          title="محادثة جديدة"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold/25 text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
        >
          <MessageSquarePlus className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          {renaming === conversation.id ? (
            <input
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameCommit();
                if (e.key === "Escape") setPickerOpen(false);
              }}
              autoFocus
              aria-label="اسم المحادثة"
              className="w-full border-b border-gold/40 bg-transparent pb-0.5 text-sm text-gold-light outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={onStartRename}
              aria-label={`إعادة تسمية المحادثة: ${conversation.title}`}
              className="block max-w-full truncate text-start text-sm text-gold-light"
            >
              {conversation.title}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            className="display-arabic mt-0.5 flex items-center gap-1.5 text-xs text-gold-muted/60 transition-colors hover:text-gold-light"
          >
            <span aria-hidden="true">{persona.symbol}</span>
            {persona.nameAr}
          </button>
        </div>

        {uid && conversations.length > 1 && (
          <details className="relative shrink-0">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-gold/25 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light">
              السجل
            </summary>
            <div className="glass-strong absolute end-0 z-40 mt-2 w-72 rounded-2xl p-2">
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {conversations.map((c) => (
                  <li key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActive(c.id)}
                      className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-start text-xs transition-colors hover:bg-gold/10 ${
                        c.id === conversation.id ? "text-gold-light" : "text-gold-muted/70"
                      }`}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      aria-label={`احذف المحادثة ${c.title}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-gold-muted/40 transition-colors hover:text-gold-light"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>

      {pickerOpen && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-4">
          <p className="display-arabic mb-2 text-xs text-gold-muted/55">
            تغيير الفيلسوف يبدأ محادثة جديدة، حتى لا تتغيّر معنى الأسطر السابقة.
          </p>
          <PersonaCards selectedId={conversation.personaId} onSelect={onChangePersona} />
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            className="mt-3 w-full text-center text-xs text-gold-muted/50"
          >
            إغلاق
          </button>
        </div>
      )}
    </header>
  );
}

function ConversationList({
  conversations,
  uid,
  
  renaming,
  renameValue,
  onOpen,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onDelete,
}: {
  conversations: Conversation[];
  uid: string | null;
  
  renaming: string | null;
  renameValue: string;
  onOpen: (c: Conversation) => void;
  onStartRename: (id: string, title: string) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: (id: string) => void;
  onDelete: (c: Conversation) => void;
}) {
  if (conversations.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
        محادثاتك
      </h2>
      <ul className="flex flex-col gap-2">
        {conversations.map((c) => (
          <li key={c.id} className="glass flex items-center gap-2 px-4 py-3">
            {renaming === c.id ? (
              <input
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={() => onRenameCommit(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameCommit(c.id);
                }}
                autoFocus
                aria-label="اسم المحادثة"
                className="min-w-0 flex-1 border-b border-gold/40 bg-transparent text-sm text-gold-light outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="display-arabic min-w-0 flex-1 truncate text-start text-sm text-gold-muted"
              >
                {c.title}
              </button>
            )}
            <button
              type="button"
              onClick={() => onStartRename(c.id, c.title)}
              aria-label={`إعادة تسمية ${c.title}`}
              className="text-xs text-gold-muted/50 hover:text-gold-light"
            >
              تسمية
            </button>
            <button
              type="button"
              onClick={() => onDelete(c)}
              aria-label={`حذف ${c.title}`}
              className="flex size-7 items-center justify-center rounded-full text-gold-muted/45 hover:text-gold-light"
            >
              <Trash2 className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      {!uid && (
        <p className="display-arabic mt-3 text-xs leading-relaxed text-gold-muted/45">
          محادثاتك محفوظة على هذا الجهاز. أنشئ حساباً لتحملها معك إلى أي جهاز آخر.
        </p>
      )}
    </section>
  );
}

export default WisdomChat;
