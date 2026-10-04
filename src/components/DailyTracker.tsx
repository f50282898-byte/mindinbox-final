"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { db, paths } from "@/lib/firebase";
import { useAppStore, type EntryKind } from "@/lib/store";
import { useSession, useTrackerEntries, writeEntry } from "@/lib/session";
import { TIER_DEFINITIONS, tierSatisfies, type Tier } from "@/lib/tiers";

const KINDS: Array<{ id: EntryKind; label: string; hint: string }> = [
  { id: "habit", label: "عادة", hint: "ما الذي غرسته اليوم؟" },
  { id: "thought", label: "فكرة", hint: "ما الذي شغلك؟" },
  { id: "time", label: "وقت", hint: "أين ذهبت ساعتك؟" },
];

const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Last seven days as local-midnight timestamps, oldest first. */
function lastSevenDays(now: number): number[] {
  const days: number[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    days.push(d.getTime());
  }
  return days;
}

function entryLimitFor(tier: Tier): number | null {
  return TIER_DEFINITIONS[tier].trackerEntries;
}

/**
 * Daily Tracker.
 *
 * Firestore-backed via `onSnapshot`, so the offline cache keeps the chart
 * populated without a connection and writes queue for sync. The zustand store
 * holds a mirror purely so the bars paint on first frame.
 */
export function DailyTracker() {
  const { state } = useSession();
  const tier = useAppStore((s) => s.tier);
  const entries = useAppStore((s) => s.entries);
  const removeEntry = useAppStore((s) => s.removeEntry);
  const uid = useAppStore((s) => s.uid);

  const { error, syncing } = useTrackerEntries(Boolean(uid));

  const [kind, setKind] = useState<EntryKind>("thought");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const limit = entryLimitFor(tier);
  const unlocked = tierSatisfies(tier, "oracle");

  const days = useMemo(() => lastSevenDays(Date.now()), []);

  const buckets = useMemo(
    () =>
      days.map((dayStart) => {
        const next = new Date(dayStart);
        next.setDate(next.getDate() + 1);
        const count = entries.filter((e) => {
          const t = new Date(e.createdAt);
          return t.getTime() >= dayStart && t.getTime() < next.getTime();
        }).length;
        return { dayStart, count, label: DAY_LABELS[new Date(dayStart).getDay()] };
      }),
    [days, entries]
  );

  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const streak = useMemo(() => {
    let count = 0;
    for (let i = buckets.length - 1; i >= 0; i -= 1) {
      if (buckets[i].count > 0) count += 1;
      else break;
    }
    return count;
  }, [buckets]);

  const todayCount = buckets[buckets.length - 1]?.count ?? 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || saving) return;

    if (limit !== null && todayCount >= limit) {
      setNotice(
        tier === "free"
          ? `بلغت حدّ اليوم في المستوى المجاني (${limit}). العضوية تفتح تتبّعاً غير محدود.`
          : "بلغت حدّ الإدخالات لهذا اليوم."
      );
      return;
    }

    setSaving(true);
    setNotice(null);
    const synced = await writeEntry(kind, trimmed);
    setText("");
    if (!synced) setNotice("حُفظ محلياً وسيُزامَن عند عودة الاتصال.");
    setSaving(false);
  };

  const remove = async (id: string) => {
    removeEntry(id);
    if (!uid || !db) return;
    // The local mirror uses a client UUID for offline writes; a real Firestore
    // doc id is what the rules check, so only delete when it is one.
    if (id.length === 20) {
      try {
        await deleteDoc(doc(db, `${paths.userEntries(uid)}/${id}`));
      } catch {
        setNotice("تعذّر الحذف من الخادم.");
      }
    }
  };

  /* ── Session states ──
     `loading` must not fall through to the full tracker: that flashes the
     signed-in surface (and the limit meter) at an anonymous visitor before
     auth has resolved. */
  if (state === "loading") {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
        <div className="panel h-56 animate-pulse" />
        <div className="panel mt-6 h-64 animate-pulse" />
        <span className="sr-only">جارٍ التحقق من الجلسة…</span>
      </div>
    );
  }
  if (state === "unavailable") {
    return <Panel title="متتبع الوعي" empty="المتتبع يحتاج إعداد Firebase. أضف مفاتيحه في متغيرات البيئة." />;
  }
  if (state !== "member") {
    return (
      <Panel
        title="متتبع الوعي"
        empty="سجّل الدخول لتبدأ التتبّع. سجلّك يُحفظ في حسابك ويبقى متاحاً دون اتصال."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:py-14">
      <header className="text-center">
        <h1 className="gold-text-glow display-arabic text-3xl font-bold text-gold-light sm:text-4xl">
          متتبع الوعي
        </h1>
        <p className="display-latin mt-1 text-[11px] tracking-[0.3em] text-gold-muted/50">
          DAILY TRACKER
        </p>
      </header>

      {/* ── Gold bar chart ── */}
      <section className="panel p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-widest text-gold-muted/55">الأسبوع</p>
            <p className="display-arabic mt-1 text-lg text-gold-light">{total} إدخال</p>
          </div>
          <div className="flex items-center gap-5 text-xs text-gold-muted/65">
            <Stat label="سلسلة" value={`${streak} يوم`} />
            <Stat label="ذروة" value={`${peak} / يوم`} />
            {!unlocked && <Stat label="حدّ اليوم" value={`${todayCount} / ${limit}`} />}
          </div>
        </div>

        <div className="flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label={`توزيع الإدخالات على آخر سبعة أيام، المجموع ${total}`}>
          {buckets.map((bucket, index) => {
            const ratio = bucket.count / peak;
            const isToday = index === buckets.length - 1;
            return (
              <div key={bucket.dayStart} className="flex h-full flex-1 flex-col justify-end gap-2">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(3, ratio * 100)}%` }}
                  transition={{
                    duration: 0.7,
                    delay: index * 0.06,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`w-full rounded-t-md ${
                    isToday
                      ? "bg-gradient-to-t from-gold-dark/40 to-gold-light shadow-[0_0_14px_rgba(212,175,55,0.55)]"
                      : "bg-gradient-to-t from-gold-dark/20 to-gold/70"
                  }`}
                />
                <span
                  className={`text-center text-[10px] ${
                    isToday ? "text-gold-light" : "text-gold-muted/50"
                  }`}
                >
                  {bucket.label.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Composer ── */}
      <section className="panel p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap gap-2">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setKind(item.id)}
              aria-pressed={kind === item.id}
              className={`chip ${kind === item.id ? "chip-active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="tracker-input" className="sr-only">
            {KINDS.find((k) => k.id === kind)?.hint}
          </label>
          <textarea
            id="tracker-input"
            rows={3}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={KINDS.find((k) => k.id === kind)?.hint ?? ""}
            className="field resize-none"
          />

          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] text-gold-muted/45">{text.length} / 500</span>
            <button type="submit" disabled={!text.trim() || saving} className="btn-gold px-7 py-3">
              <span>
                <Plus className="me-1 inline size-4" />
                {saving ? "جارٍ الحفظ…" : "سجّل"}
              </span>
            </button>
          </div>
        </form>

        {notice && <p className="mt-4 text-xs text-gold/75">{notice}</p>}
        {error && <p role="alert" className="mt-4 text-xs text-red-300/85">{error}</p>}
        {syncing && <p className="mt-4 text-xs text-gold-muted/50">جارٍ المزامنة…</p>}
      </section>

      {/* ── Feed ── */}
      <section className="space-y-3">
        <AnimatePresence initial={false}>
          {entries.slice(0, 40).map((entry) => (
            <motion.article
              key={entry.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="panel-inset group flex items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="chip px-2.5 py-0.5 text-[10px]">
                    {KINDS.find((k) => k.id === entry.kind)?.label ?? entry.kind}
                  </span>
                  <time
                    dateTime={new Date(entry.createdAt).toISOString()}
                    className="text-[10px] text-gold-muted/40"
                  >
                    {new Date(entry.createdAt).toLocaleString("ar-EG", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gold-muted/90">
                  {entry.text}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void remove(entry.id)}
                aria-label="حذف الإدخال"
                className="shrink-0 rounded-full p-2 text-gold-muted/30 opacity-0 transition-all hover:text-red-300/80 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </motion.article>
          ))}
        </AnimatePresence>

        {entries.length === 0 && (
          <p className="display-arabic py-8 text-center text-sm text-gold-muted/45">
            لا شيء بعد. أول إدخال هو أثقل خطوة.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-widest text-gold-muted/45">{label}</p>
      <p className="display-arabic mt-0.5 text-sm text-gold-light">{value}</p>
    </div>
  );
}

function Panel({ title, empty }: { title: string; empty: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <h1 className="gold-text-glow display-arabic text-center text-3xl font-bold text-gold-light">
        {title}
      </h1>
      <p className="display-arabic mx-auto mt-8 max-w-md text-center text-sm leading-relaxed text-gold-muted/60">
        {empty}
      </p>
    </div>
  );
}
