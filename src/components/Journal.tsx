"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { db, paths } from "@/lib/firebase";
import { useSession, useTrackerEntries, writeEntry } from "@/lib/session";
import { useAppStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";

/**
 * The journal.
 *
 * Built on the existing `thought` entry kind rather than a parallel store, so
 * journal text lands in exactly the same place as tracker text: `users/{uid}
 * /entries` in Firestore, mirrored into the zustand store for instant feedback.
 *
 * Nothing here is sent to an AI provider. That only happens when the visitor
 * explicitly asks for a reading — see /dialogue.
 */

function formatDay(ts: number, locale: "ar" | "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    // Deterministic grouping key, so the list can be split by day without
    // rendering every timestamp twice.
    year: "numeric",
  }).format(new Date(ts));
}

function dayKey(ts: number, locale: "ar" | "en") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-CA").format(new Date(ts));
}

export function Journal() {
  const { uid } = useSession();
  const { syncing } = useTrackerEntries(Boolean(uid));
  const entries = useAppStore((s) => s.entries);
  const { t, locale } = useLocale();

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const thoughts = useMemo(
    () =>
      entries
        .filter((e) => e.kind === "thought")
        .sort((a, b) => b.createdAt - a.createdAt),
    [entries]
  );

  // Group by calendar day so a long journal stays navigable.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: typeof thoughts }[] = [];
    for (const e of thoughts) {
      const key = dayKey(e.createdAt, locale);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, label: formatDay(e.createdAt, locale), items: [e] });
    }
    return out;
  }, [thoughts, locale]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await writeEntry("thought", text);
      setDraft("");
      areaRef.current?.focus();
    } catch {
      setError(t({ ar: "تعذّر الحفظ. حاول مرة أخرى.", en: "Could not save. Try again." }));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!uid || !db) return;
    await deleteDoc(doc(db, `${paths.userEntries(uid)}/${id}`)).catch(() => undefined);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="display-arabic text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          المفكرة
        </h1>
        <p className="display-latin mt-1 text-lg text-gold-muted/70">Journal</p>
        <p className="display-arabic mt-4 leading-loose text-gold-muted">
          ما تكتبه هنا لا يُرسل إلى أي نموذج ذكاء اصطناعي. لا يُقرأ إلا إذا طلبت أنت قراءةً
          فيلسوفية.
        </p>
        <p className="mt-2 leading-relaxed text-gold-muted/65">
          Nothing written here is sent to an AI model. It is read only if you explicitly ask for a
          philosopher&apos;s reading.
        </p>
      </header>

      <form onSubmit={submit} className="glass p-5">
        <label htmlFor="journal-input" className="display-arabic text-sm text-gold-light">
          {t({ ar: "ما الذي يشغل فكرك؟", en: "What occupies you?" })}
        </label>
        <textarea
          id="journal-input"
          ref={areaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={4000}
          dir="auto"
          className="panel-inset mt-3 w-full resize-none text-gold-muted placeholder:text-ink-3 focus:outline-none"
          placeholder={t({
            ar: "اكتب هنا. لا أحد يقرأ هذا إلا أنت.",
            en: "Write here. No one reads this but you.",
          })}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-3">
            {uid
              ? syncing
                ? t({ ar: "جارٍ المزامنة…", en: "Syncing…" })
                : t({ ar: "محفوظ في حسابك.", en: "Saved to your account." })
              : t({
                  ar: "مسجّل الدخول لتبقى محفوظة على جهازك.",
                  en: "Sign in to keep it on your device.",
                })}
          </span>
          <button
            type="submit"
            disabled={!draft.trim() || saving}
            className="btn-gold px-6 py-2.5 text-sm disabled:opacity-40"
          >
            {t({ ar: "احفظ", en: "Save" })}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-gold-light">
            {error}
          </p>
        )}
      </form>

      {thoughts.length === 0 ? (
        <div className="glass mt-6 p-8 text-center">
          <p className="display-arabic text-gold-muted">
            {t({ ar: "لا شيء بعد. أول سطر يكفي.", en: "Nothing yet. One line is enough." })}
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="display-arabic mb-3 border-b border-gold/12 pb-2 text-sm text-gold-muted/60">
                {g.label}
              </h2>
              <ul className="flex flex-col gap-3">
                {g.items.map((e) => (
                  <li key={e.id} className="glass group p-4">
                    <p className="display-arabic whitespace-pre-wrap leading-loose text-gold-muted">
                      {e.text}
                    </p>
                    {uid && db && (
                      <button
                        type="button"
                        onClick={() => void remove(e.id)}
                        className="mt-2 flex items-center gap-1.5 text-xs text-ink-3 opacity-0 transition-opacity hover:text-gold-light focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={t({ ar: "احذف هذه الفكرة", en: "Delete this thought" })}
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                        {t({ ar: "احذف", en: "Delete" })}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default Journal;
