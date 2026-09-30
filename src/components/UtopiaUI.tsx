"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { addDoc, collection, onSnapshot } from "firebase/firestore";
import { ArrowUp, BookOpen, Check, Clock3, Sparkles } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useAppStore, type DailyEntry } from "@/lib/store";

type ChatMessage = { role: "user" | "model"; content: string };
type EntryKind = DailyEntry["kind"];

const entryLabels: Record<EntryKind, string> = {
  habit: "Practice",
  thought: "Thought",
  time: "Time",
};

export function UtopiaUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "model", content: "مرحباً بك. ما الفكرة التي تستحق أن نتأملها معاً؟" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [entryText, setEntryText] = useState("");
  const [entryKind, setEntryKind] = useState<EntryKind>("thought");
  const [savingEntry, setSavingEntry] = useState(false);
  const [dailyReport, setDailyReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState("");
  const [todayLabel, setTodayLabel] = useState("");
  const { freeInteractions, increment, setFreeInteractions, tier, uid, entries, setEntries, addEntry } = useAppStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const todayEntries = useMemo(
    () => entries.filter((entry) => entry.createdAt.slice(0, 10) === today),
    [entries, today],
  );

  useEffect(() => {
    const currentDate = new Date();
    setToday(currentDate.toISOString().slice(0, 10));
    setTodayLabel(currentDate.toLocaleDateString("en", { month: "short", day: "2-digit" }));
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!uid || !db) return;
    return onSnapshot(collection(db, "users", uid, "entries"), (snapshot) => {
      const nextEntries = snapshot.docs
        .map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }) as DailyEntry)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setEntries(nextEntries);
    }, () => setNotice("Offline mode: saved reflections will sync when connection returns."));
  }, [uid, setEntries]);

  const handleSend = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;
    if (!uid && freeInteractions >= 5) {
      setNotice("Your five complimentary conversations are complete. Sign in to continue.");
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setNotice("");

    try {
      const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : undefined;
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const result = await response.json() as { ok?: boolean; text?: string; error?: string; via?: string };
      if (response.status === 429) {
        if (!uid) setFreeInteractions(5);
        else setNotice(result.error ?? "Your current daily allowance is complete.");
        setMessages(messages);
        setInput(prompt);
        return;
      }
      if (!response.ok || !result.text) throw new Error(result.error ?? "Reflection service unavailable");
      setMessages([...nextMessages, { role: "model", content: result.text }]);
      if (!uid) increment();
      if (uid && db) {
        void addDoc(collection(db, "analyticsEvents"), {
          uid,
          type: "ai_interaction",
          createdAt: new Date().toISOString(),
          provider: result.via ?? "unknown",
        }).catch(() => undefined);
      }
    } catch {
      setMessages(messages);
      setInput(prompt);
      setNotice("The reflection service is unavailable for a moment. Your free turn was not used.");
    } finally {
      setLoading(false);
    }
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = entryText.trim();
    if (!text || savingEntry) return;
    setSavingEntry(true);
    const entry: DailyEntry = {
      id: crypto.randomUUID(),
      kind: entryKind,
      text,
      createdAt: new Date().toISOString(),
    };
    addEntry(entry);

    try {
      if (uid && db) {
        await addDoc(collection(db, "users", uid, "entries"), entry);
      }
      setEntryText("");
      setNotice(uid ? "Reflection saved and syncing across your devices." : "Reflection saved on this device.");
    } catch {
      setEntryText("");
      setNotice("Could not sync this entry. It remains available in this session.");
    } finally {
      setSavingEntry(false);
    }
  };

  const createDailyReport = async () => {
    if (tier === "free" || todayEntries.length === 0 || reportLoading) return;
    setReportLoading(true);
    setDailyReport("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth?.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {}),
        },
        body: JSON.stringify({
          feature: "daily-philosopher",
          messages: [
            { role: "user", content: `Offer a thoughtful, non-clinical daily reflection based only on these entries. Avoid diagnosis and give one gentle question for tomorrow: ${todayEntries.map((entry) => `${entry.kind}: ${entry.text}`).join("; ")}` },
          ],
        }),
      });
      const result = await response.json() as { text?: string };
      if (!response.ok || !result.text) throw new Error("Report unavailable");
      setDailyReport(result.text);
    } catch {
      setNotice("The Daily Philosopher is resting. Please try again later.");
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <main className="utopia-app">
      <header className="utopia-app-header">
        <a className="app-wordmark" href="/">Mind in a Box <span>عقل في صندوق</span></a>
        <div className="account-status">
          <span className={`tier-indicator tier-${tier}`}>{tier === "free" ? (uid ? "TRIAL" : "OPEN ACCESS") : tier.toUpperCase()}</span>
          {!uid && <span>{Math.max(0, 5 - freeInteractions)} conversations left</span>}
          <a href="/#access">Membership</a>
        </div>
      </header>

      <div className="utopia-workspace">
        <section className="conversation-panel" aria-label="Philosophical conversation">
          <div className="conversation-heading">
            <div>
              <p className="eyebrow">THE UTOPIA</p>
              <h1>Make room for a better question.</h1>
            </div>
            <Sparkles aria-hidden="true" size={19} strokeWidth={1.4} />
          </div>

          <div aria-live="polite" className="conversation-list">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.article
                  animate={{ opacity: 1, y: 0 }}
                  className={`message message-${message.role}`}
                  initial={{ opacity: 0, y: 8 }}
                  key={`${index}-${message.role}`}
                  transition={{ duration: 0.28 }}
                >
                  <span>{message.role === "model" ? "THE GUIDE" : "YOU"}</span>
                  <p>{message.content}</p>
                </motion.article>
              ))}
              {loading && <p className="thinking-indicator">Gathering a considered response…</p>}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <form className="prompt-form" onSubmit={handleSend}>
            <label className="sr-only" htmlFor="prompt">Your question</label>
            <textarea
              id="prompt"
              maxLength={2000}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="What is on your mind?"
              rows={2}
              value={input}
            />
            <button aria-label="Send question" disabled={loading || !input.trim()} type="submit">
              <ArrowUp aria-hidden="true" size={18} />
            </button>
          </form>
          <p className="conversation-disclaimer">For reflection and learning, not mental-health diagnosis or care.</p>
        </section>

        <aside className="journal-panel" aria-label="Daily reflection journal">
          <div className="journal-heading">
            <div>
              <p className="eyebrow">A DAILY PRACTICE</p>
              <h2>Keep what matters.</h2>
            </div>
            <span className="journal-date">{todayLabel}</span>
          </div>

          <form className="entry-form" onSubmit={saveEntry}>
            <div className="entry-kind-control" aria-label="Reflection type" role="group">
              {(Object.keys(entryLabels) as EntryKind[]).map((kind) => (
                <button
                  aria-pressed={entryKind === kind}
                  className={entryKind === kind ? "selected" : ""}
                  key={kind}
                  onClick={() => setEntryKind(kind)}
                  type="button"
                >
                  {entryLabels[kind]}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="daily-entry">Add a daily note</label>
            <textarea
              id="daily-entry"
              maxLength={500}
              onChange={(event) => setEntryText(event.target.value)}
              placeholder={entryKind === "habit" ? "A practice you kept…" : entryKind === "time" ? "Where your time went…" : "A thought worth keeping…"}
              rows={3}
              value={entryText}
            />
            <button className="entry-submit" disabled={!entryText.trim() || savingEntry} type="submit">
              <Check aria-hidden="true" size={15} /> Save reflection
            </button>
          </form>

          <div className="journal-entries">
            <div className="entries-title"><span>Today</span><span>{todayEntries.length} notes</span></div>
            {todayEntries.length === 0 ? (
              <p className="empty-journal">Begin with one honest sentence.</p>
            ) : todayEntries.slice(0, 5).map((entry) => (
              <article className="journal-entry" key={entry.id}>
                <span>{entry.kind === "habit" ? <Check size={13} /> : entry.kind === "time" ? <Clock3 size={13} /> : <BookOpen size={13} />}</span>
                <div><small>{entryLabels[entry.kind]}</small><p>{entry.text}</p></div>
              </article>
            ))}
          </div>

          {tier !== "free" && (
            <section className="daily-philosopher">
              <div><Sparkles aria-hidden="true" size={16} /><h3>Daily Philosopher</h3></div>
              <p>A considered reflection on the notes you chose to keep today.</p>
              <button disabled={!todayEntries.length || reportLoading} onClick={() => void createDailyReport()} type="button">
                {reportLoading ? "Reflecting…" : "Prepare today’s reflection"}
              </button>
              {dailyReport && <p className="daily-report">{dailyReport}</p>}
            </section>
          )}

          <p aria-live="polite" className="workspace-notice">{notice}</p>
        </aside>
      </div>
    </main>
  );
}
