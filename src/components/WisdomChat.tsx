"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  MessageSquarePlus,
  Quote,
  RefreshCw,
  Trash2,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { GateDialog } from "@/components/GateDialog";
import { BottomSheet } from "@/components/BottomSheet";
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
import { auth as firebaseAuth } from "@/lib/firebase";
import { useAppStore } from "@/lib/store";
import { writeEntry } from "@/lib/session";
import { consumeStream, readErrorBody } from "@/lib/stream-client";
import { useJournal } from "@/lib/journal/store";
import { sanitizeContent, sanitizeTitle } from "@/lib/security/sanitize";

/**
 * /wisdom — ask one philosopher.
 *
 * Rebuilt as an "Interactive Wisdom Document":
 *  - each assistant reply carries its own header (icon + philosopher name)
 *  - generated text renders with loose paragraphs, amber-emphasised focus lines,
 *    and block quotes in a luminous side frame
 *  - a toolbar under every reply (copy / save to journal / regenerate)
 *  - quick prompt chips above the composer to start the dialogue
 *
 * Order of concerns, deliberately:
 *  1. render the conversation (local, instant)
 *  2. stream the reply token-by-token via Edge SSE
 *  3. persist locally as it streams, so a dropped connection loses nothing
 *  4. sync to Firestore when signed in
 */

/** Fixed opening questions — same door for returning readers. */
const OPENING_QUESTIONS = [
  "ما الفرق بين أن تعيش حياة، وأن تكون حيّاً فحسب؟",
  "إذا كانت الفضيلة فعلاً، فما الذي يجعل الفعل فعلاً لا مجرّد نية؟",
  "أين تقف حدود العقل، وما الذي لا يستطيع تبريره؟",
] as const;

/** Quick prompts shown above the composer when the composer is empty. */
const QUICK_PROMPTS = [
  "كيف أجد السكينة وسط ضجيج التفكير المستمر؟",
  "ما الفرق بين الصبر عن وعي والاستسلام للواقع؟",
  "كيف أتحرر من الخوف من المجهول؟",
  "هل يقودنا العقل أم تحركنا العاطفة من حيث لا نشعر؟",
] as const;

type Status = "idle" | "streaming" | "error";

export function WisdomChat() {
  const { state: authState, uid } = useSession();
  const isMember = useAppStore((s) => s.tier === "oracle" || s.tier === "sanctum");
  const router = useRouter();
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

  const addNote = useJournal((s) => s.addNote);

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
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [bottomSheetContent, setBottomSheetContent] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const handledInitialQueryRef = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (authState === "unavailable") return;
    void syncTo(uid);
  }, [authState, uid, syncTo]);

  useEffect(() => {
    const up = () => { setOnline(true); setError(null); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [active?.messages, status]);

  const send = useCallback(
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

      const token = await firebaseAuth?.currentUser?.getIdToken();

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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
            setError(null);
          } else {
            setError(body?.error ?? "تعذّر الاتصال بالخدمة.");
          }
          patchMessage(conversation.id, assistantMessageId, { complete: true });
          setStatus("idle");
          return;
        }

        let accumulated = "";
        const outcome = await consumeStream(
          res.body,
          {
            onDelta: (chunk) => {
              accumulated += chunk;
              patchMessage(conversation.id, assistantMessageId, {
                content: accumulated,
                complete: false,
              });
              setStatus("streaming");
            },
            onQuota: (remaining) => setAttemptsLeft(remaining),
          },
          controller.signal
        );

        if (outcome.text) {
          patchMessage(conversation.id, assistantMessageId, {
            content: accumulated || outcome.text,
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
      active, createConversation, draft, openGate, online, personaId,
      patchMessage, appendMessage, setAttemptsLeft, status,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined" || handledInitialQueryRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("philosopher");
    const q = params.get("q");
    if (!p && !q) return;
    handledInitialQueryRef.current = true;

    const persona = getPersona(p);
    const questionText = (q ?? "").trim();
    if (questionText) {
      const conv = createConversation(persona.id, questionText);
      setActive(conv.id);
      window.history.replaceState({}, "", "/wisdom");
      void send(questionText);
    } else if (p) {
      const conv = createConversation(persona.id, persona.nameAr);
      setActive(conv.id);
      window.history.replaceState({}, "", "/wisdom");
    }
  }, [createConversation, setActive, send]);

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

  /** Save an assistant reply as a note in the bento workspace and open it. */
  async function saveToNote(content: string) {
    try {
      const clean = sanitizeContent(content);
      const firstLine = clean.split("\n")[0].trim();
      const title =
        firstLine.length > 0 ? firstLine.slice(0, 60) : "فكرة من الحوار";
      addNote({
        title: sanitizeTitle(title),
        content: clean,
        category: "philosophical",
        color: "amber",
        pinned: false,
      });
      setBottomSheetContent({ title: sanitizeTitle(title), content: clean });
      setBottomSheetOpen(true);
      setNotice("حُفظت في المفكرة كملاحظة.");
    } catch {
      setError("تعذّر الحفظ في المفكرة.");
    }
  }

  const exhausted = !isMember && attemptsLeft !== null && attemptsLeft <= 0;

  const gateOpen = useAppStore((s) => s.gateOpen);
  const closeGate = useAppStore((s) => s.closeGate);

  /* ═══ Empty state ═══════════════════════════════════════════════════════════════════════════════════ */
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <header className="mb-8">
          <h1 className="display-arabic text-2xl font-bold text-zinc-100">اسأل الحكيم</h1>
          <p className="display-latin mt-1 text-xs tracking-[0.25em] text-zinc-400">
            ASK THE WISE
          </p>
          <p className="display-arabic mt-4 leading-loose text-zinc-400/80">
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
                className="glass w-full px-4 py-3 text-start text-[0.9rem] leading-relaxed text-zinc-200/80 transition-colors hover:border-gold/40 hover:text-zinc-100"
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
    setActive(conversation.id);
    setDraft(text);
    queueMicrotask(() => {
      const el = inputRef.current;
      el?.focus();
    });
    setStreamText("");
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

  /* ═══ Transcript ════════════════════════════════════════════════════════════════════════════════════════════ */
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
          setActive(createConversation(id).id);
        }}
      />

      <div
        ref={transcriptRef}
        data-streaming={status === "streaming" ? "1" : "0"}
        data-bubbles={active.messages.length}
        className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-4"
      >
        <ul className="flex flex-col gap-6 pt-4">
          {active.messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <li
                key={message.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                {/* User message */}
                {isUser && (
                  <div
                    dir="auto"
                    className="max-w-[86%] rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed bg-gold/5 border border-gold/20 text-zinc-100 sm:max-w-[80%]"
                  >
                    <Markdown text={message.content} />
                  </div>
                )}

                {/* Assistant message — royal manuscript card */}
                {!isUser && (
                  <article className="flex flex-col gap-2 mb-1 ps-1">
                    {/* Card header: gold mark, philosopher name and epithet. */}
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="size-6 shrink-0 text-gold-light"
                      >
                        {persona.symbol}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="display-arabic font-bold text-gold-light">
                          {persona.nameAr}
                        </span>
                        <span className="display-latin mt-0.5 text-[10px] tracking-[0.18em] text-gold-muted/80">
                          {persona.nameEn ?? "Philosopher"}
                        </span>
                        <span className="display-arabic mt-0.5 text-[11px] text-gold-muted/60">
                          {persona.epithetAr}
                        </span>
                      </div>
                    </div>

                    {/* Card body — a page from a modern royal manuscript. */}
                    <div
                      dir="auto"
                      className={`bg-[#0E121B]/90 border border-gold/20 shadow-2xl rounded-3xl p-5 sm:p-6 ${message.complete ? "text-zinc-100" : "text-zinc-200/90 animate-pulse"}`}
                    >
                      {message.complete ? (
                        <div className="text-[1rem] leading-[2]">
                          <Markdown text={message.content} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-zinc-400/70">
                          <Sparkles className="size-4 animate-pulse text-gold-light" />
                          <span className="display-arabic text-sm leading-relaxed">
                            الحكيم يصوغ الفكرة…
                          </span>
                        </div>
                      )}
                    </div>

                    {message.complete && (
                      <ResponseToolbar
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
                          if (prior) {
                            void send(prior.content, { replaceMessageId: message.id });
                          }
                        }}
                        onSave={() => void saveToJournal(active, message.content)}
                        onSaveToNote={() => void saveToNote(message.content)}
                      />
                    )}
                  </article>
                )}

                {/* Streaming placeholder bubble */}
                {!isUser && status === "streaming" && !message.content && message.id === active.messages[active.messages.length - 1]?.id && (
                  <div className="max-w-[92%] rounded-2xl px-4 py-3 border border-gold/20 bg-[#0E121B]/80 text-zinc-200/90 backdrop-blur-xl shadow-2xl sm:max-w-[82%]">
                    <div className="flex items-center gap-2 text-zinc-400/70">
                      <Sparkles className="size-4 animate-pulse text-gold-light" />
                      <span className="display-arabic text-sm leading-relaxed">
                        الحكيم يصوغ الفكرة…
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      {/* Composer — sticky bottom */}
      <div
        className="sticky bottom-0 z-20 border-t border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl"
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
            <p role="status" className="display-arabic mt-2 text-center text-xs text-zinc-400/70">
              {notice}
            </p>
          )}
          {!online && (
            <p role="status" className="display-arabic mt-2 text-center text-xs text-gold-light">
              لا يوجد اتصال. ما تكتبه يُحفظ على جهازك.
            </p>
          )}

          {/* Quick prompts when composer is empty */}
          {!draft && status === "idle" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <p className="mr-2 text-[10px] tracking-[0.2em] text-zinc-500/60 uppercase font-medium">
                اقتراحات سريعة
              </p>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setDraft(prompt);
                    void sendLive();
                  }}
                  className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-[11px] text-zinc-300 transition-colors hover:border-gold/40 hover:text-gold-light"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendLive();
            }}
            className="mt-3 flex items-end gap-2"
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
              disabled={status === "streaming"}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
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
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold text-black transition-transform duration-300 hover:scale-105 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                <path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          {exhausted && (
            <button type="button" onClick={openGate} className="mt-3 w-full py-3 btn-gold">
              <span>أنشئ حساباً — 14 يوماً بلا حدود</span>
            </button>
          )}
        </div>
      </div>

      <GateDialog open={gateOpen} onClose={closeGate} remaining={attemptsLeft} />

      {/* Bottom Sheet على الهاتف — عرض الملاحظة المحفوظة */}
      <BottomSheet
        open={bottomSheetOpen}
        onClose={() => setBottomSheetOpen(false)}
        headerTitle="تم الحفظ في المفكرة"
        headerIcon={<BookOpen className="size-5" />}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
            <h4 className="display-arabic font-bold text-zinc-100 text-sm mb-1">
              {bottomSheetContent?.title}
            </h4>
            <p className="display-arabic text-zinc-300/80 text-xs leading-relaxed">
              {bottomSheetContent?.content}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                setBottomSheetOpen(false);
                void router.push("/journal");
              }}
              className="btn-gold px-6 py-2.5 text-sm font-semibold"
            >
              افتح في المفكرة
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

/**
 * Toolbar under every completed assistant reply:
 * Copy • Save to journal • Regenerate
 */
function ResponseToolbar({
  content,
  copied,
  busy,
  onCopy,
  onRegenerate,
  onSave,
  onSaveToNote,
}: {
  content: string;
  copied: boolean;
  busy: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onSaveToNote: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 flex items-center gap-1 ps-1">
      <ActionButton label={copied ? "نُسخ" : "نسخ الرد"} onClick={onCopy} active={copied}>
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </ActionButton>

      <ActionButton label="احفظ في المفكرة" onClick={onSave}>
        <BookOpen className="size-3" />
      </ActionButton>

      <ActionButton label="احفظ كملاحظة في المفكرة" onClick={onSaveToNote}>
        <Sparkles className="size-3" />
      </ActionButton>

      <ActionButton label="إعادة الصياغة" onClick={onRegenerate} disabled={busy}>
        <RefreshCw className="size-3" />
      </ActionButton>

      <ActionButton
        label="اجعلها بطاقة اقتباس"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Quote className="size-3" />
      </ActionButton>

      {open && (
        <span className="display-arabic flex items-center gap-1.5 text-[0.7rem] text-zinc-400/60">
          <span className="max-w-[16rem] truncate">{content.slice(0, 40)}…</span>
          <Link
            href="/quotes"
            className="text-gold-light underline underline-offset-2 transition-colors hover:text-gold-light"
            onClick={() => setOpen(false)}
          >
            إلى الأرشيف
          </Link>
          <span className="text-zinc-500">(قريباً)</span>
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
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-30 ${
        active
          ? "border-gold/50 text-gold-light"
          : "border-white/10 text-zinc-400/60 hover:border-gold/40 hover:text-zinc-100"
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
    <header className="sticky top-0 z-30 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onNew}
          aria-label="محادثة جديدة"
          title="محادثة جديدة"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-zinc-400 transition-colors hover:border-gold/40 hover:text-zinc-100"
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
              className="w-full border-b border-gold/40 bg-transparent pb-0.5 text-sm text-zinc-100 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={onStartRename}
              aria-label={`إعادة تسمية المحادثة: ${conversation.title}`}
              className="block max-w-full truncate text-start text-sm text-zinc-100"
            >
              {conversation.title}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            className="display-arabic mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400/60 transition-colors hover:text-zinc-100"
          >
            <span aria-hidden="true">{persona.symbol}</span>
            {persona.nameAr}
          </button>
        </div>

        {uid && conversations.length > 1 && (
          <details className="relative shrink-0">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-white/20 text-xs text-zinc-400 transition-colors hover:border-gold/40 hover:text-zinc-100">
              السجل
            </summary>
            <div className="glass-strong absolute end-0 z-40 mt-2 w-72 rounded-2xl p-2">
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {conversations.map((c) => (
                  <li key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActive(c.id)}
                      className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-start text-xs transition-colors hover:bg-gold/5 ${c.id === conversation.id ? "text-zinc-100" : "text-zinc-400/70"}`}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      aria-label={`احذف المحادثة ${c.title}`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-400/60 transition-colors hover:text-gold-light"
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
          <p className="display-arabic mb-2 text-xs text-zinc-400/60">
            تغيير الفيلسوف يبدأ محادثة جديدة، حتى لا تتغيّر معنى الأسطر السابقة.
          </p>
          <PersonaCards selectedId={conversation.personaId} onSelect={onChangePersona} />
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            className="mt-3 w-full text-center text-xs text-zinc-400/60"
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
                className="min-w-0 flex-1 border-b border-gold/40 bg-transparent text-sm text-zinc-100 outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="display-arabic min-w-0 flex-1 truncate text-start text-sm text-zinc-300"
              >
                {c.title}
              </button>
            )}
            <button
              type="button"
              onClick={() => onStartRename(c.id, c.title)}
              aria-label={`إعادة تسمية ${c.title}`}
              className="text-xs text-zinc-400/60 hover:text-gold-light"
            >
              تسمية
            </button>
            <button
              type="button"
              onClick={() => onDelete(c)}
              aria-label={`حذف ${c.title}`}
              className="flex size-7 items-center justify-center rounded-full text-zinc-400/60 hover:text-gold-light"
            >
              <Trash2 className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      {!uid && (
        <p className="display-arabic mt-3 text-xs leading-relaxed text-zinc-400/60">
          محادثاتك محفوظة على هذا الجهاز. أنشئ حساباً لتحملها معك إلى أي جهاز آخر.
        </p>
      )}
    </section>
  );
}

export default WisdomChat;
