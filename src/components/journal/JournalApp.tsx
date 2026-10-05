"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Check, Download, FileJson, Plus, Trash2 } from "lucide-react";
import { AiConsentSwitch } from "@/components/journal/AiConsentSwitch";
import {
  DayBars,
  HabitEnergyScatter,
  HeatmapGrid,
  TrendLine,
  VirtueRadar,
  WeekStrip,
} from "@/components/journal/Charts";
import {
  buildHeatmap,
  buildRadar,
  buildSeries,
  correlateHabitsWithEnergy,
  summariseWeek,
  windowFor,
  type HabitEnergyPoint,
} from "@/lib/journal/aggregate";
import { addDays, startOfWeek, todayKey, type DayKey } from "@/lib/journal/day-key";
import { buildExport, downloadText, exportFilename, toCsv, toJson } from "@/lib/journal/export";
import { loadRemoteJournal, useJournal } from "@/lib/journal/store";
import {
  VIRTUES,
  VIRTUE_AR,
  isDueOn,
  type Habit,
  type JournalTemplate,
  type Rating,
} from "@/lib/journal/types";
import { useSession } from "@/lib/session";
import { useAppStore } from "@/lib/store";
import { ArtLayer } from "@/components/art/ArtLayer";

/**
 * The journal.
 *
 * The value of this page is cumulative: a reader should open it and find that their
 * months are legible, their own principles are in front of them, and nothing is
 * chasing them. So the design rules are:
 *
 *  - **Nothing is required.** Energy, focus and mood are all optional, all of them
 *    every day. An empty day is shown as an empty day, not as a failure.
 *  - **The streak is shown with its grace.** When a grace day has been spent, the
 *    reader is told â€” quietly â€” rather than discovering a reset later and not
 *    knowing why.
 *  - **No counters on the landing view.** No "days remaining", no nagging. The
 *    only numbers are the reader's own.
 *  - **Mood is behind its own switch** and is never requested. (D36)
 */

const WEEKDAYS_AR = [
  { short: "إث", long: "الإثنين" },
  { short: "ثل", long: "الثلاثاء" },
  { short: "أر", long: "الأربعاء" },
  { short: "خم", long: "الخميس" },
  { short: "جم", long: "الجمعة" },
  { short: "سب", long: "السبت" },
  { short: "أح", long: "الأحد" },
];

const TEMPLATES: Array<{ id: JournalTemplate; title: string; hint: string }> = [
  { id: "morning", title: "نية الصباح", hint: "ما الذي تنوي فعله اليوم، ولماذا يهمّ؟" },
  { id: "evening", title: "مراجعة المساء", hint: "ما الذي تغيّر اليوم، وما الذي تعلّمته؟" },
  { id: "question", title: "سؤال اليوم", hint: "سؤال واحد. اتركه فارغاً إن لم يكن هناك سؤال." },
  { id: "free", title: "صفحة حرة", hint: "اكتب ما يحتملك. لا أحد يقرأ هذا سواك." },
];

type View = "day" | "week" | "month" | "year";

export function JournalApp() {  const { state: authState, uid } = useSession();
  const isMember = useAppStore((s) => s.tier === "oracle" || s.tier === "sanctum");

  const hydrate = useJournal((s) => s.hydrate);
  const ready = useJournal((s) => s.ready);
  const days = useJournal((s) => s.days);
  const habits = useJournal((s) => s.habits);
  const settings = useJournal((s) => s.settings);
  const syncing = useJournal((s) => s.syncing);
  const syncError = useJournal((s) => s.syncError);
  const flush = useJournal((s) => s.flush);

  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState<DayKey | null>(null);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [offline, setOffline] = useState(false);

  // Hydrate, then pull the server copy when there is an identity.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || !uid) return;
    void loadRemoteJournal(uid);
    void flush(uid);
  }, [ready, uid, flush]);

  // Drain the queue when the connection returns, and on an interval while online.
  useEffect(() => {
    const up = () => {
      setOffline(false);
      if (uid) void flush(uid);
    };
    const down = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = window.setInterval(() => {
      if (navigator.onLine && uid) void flush(uid);
    }, 20_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.clearInterval(timer);
    };
  }, [uid, flush]);

  const today = useMemo(() => todayKey(settings.timeZone), [settings.timeZone]);
  const current = anchor ?? today;
  // Named `range`, not `window`: shadowing the global breaks every DOM call below.
  const range = useMemo(() => windowFor(view, current), [view, current]);

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);

  const isDue = useCallback(
    (habit: Habit, key: DayKey) => isDueOn(habit, key, indexFor(habit, key)),
    []
  );

  const series = useMemo(
    () => buildSeries({ days, habits: activeHabits, from: range.from, to: range.to, isDue }),
    [days, activeHabits, range.from, range.to, isDue]
  );

  const heat = useMemo(
    () => buildHeatmap({ days, habits: activeHabits, from: range.from, to: range.to }),
    [days, activeHabits, range.from, range.to]
  );

  const radar = useMemo(
    () => buildRadar({ days, from: range.from, to: range.to }),
    [days, range.from, range.to]
  );

  const correlation = useMemo(
    () => correlateHabitsWithEnergy({ series }),
    [series]
  );

  const scatterPoints: HabitEnergyPoint[] = useMemo(
    () =>
      series.points
        .filter((p) => p.energy !== null && p.habitsDue > 0)
        .map((p) => ({
          date: p.date,
          completion: p.habitsDone / p.habitsDue,
          energy: p.energy as number,
        })),
    [series]
  );

  const weekSummary = useMemo(
    () => summariseWeek({ days, habits: activeHabits, from: startOfWeek(today), to: today }),
    [days, activeHabits, today]
  );


  const go = (delta: number) => setAnchor(addDays(current, delta));

  return (
    /* `relative` so the artwork has a positioned ancestor to inset itself against. The
       journal is the reader's own surface and the hourglass sits behind it at 30%
       opacity â€” present on a scroll, never competing with an entry. */
    <div className="relative">
      <ArtLayer id="hourglass" />
      <div className="relative mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display-arabic text-2xl font-bold text-gold-light">المفكرة</h1>
          <p className="display-latin mt-1 text-xs tracking-[0.25em] text-ink-3">
            JOURNAL
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync state, stated plainly. Never a spinner that implies pressure. */}
          {syncError ? (
            <span role="status" className="display-arabic text-[0.65rem] text-gold-muted/70">
              محفوظ على جهازك
            </span>
          ) : syncing ? (
            <span className="display-arabic text-[0.65rem] text-ink-3">يحفظ…</span>
          ) : null}
        </div>
      </header>

      {offline && (
        <p
          role="status"
          className="glass mb-4 px-4 py-3 text-center text-xs leading-relaxed text-gold-muted"
        >
          لا يوجد اتصال. كل ما تكتبه يُحفظ على جهازك، وسيُرسل تلقائياً عند عودة الشبكة.
        </p>
      )}

      <AiConsentSwitch />

      {/* â”€â”€ Principles, always in view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <PrinciplesPanel />

      {/* â”€â”€ View switcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        role="tablist"
        aria-label="المدى الزمني"
        className="mb-4 flex gap-1 rounded-xl border border-gold/15 p-1"
      >
        {(
          [
            ["day", "اليوم"],
            ["week", "الأسبوع"],
            ["month", "الشهر"],
            ["year", "السنة"],
          ] as Array<[View, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`display-arabic flex-1 rounded-lg px-2 py-2 text-xs transition-colors ${
              view === id ? "bg-gold/20 text-gold-light" : "text-gold-muted/65 hover:text-gold-light"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "day" ? (
        <>
          <DayNav current={current} onPrev={() => go(-1)} onNext={() => go(1)} onToday={() => setAnchor(null)} />
          <DayPanel date={current} />
        </>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="glass p-5">
            <h2 className="display-arabic mb-4 text-sm font-semibold text-gold-light">
              {view === "week" ? "أيام الأسبوع" : view === "month" ? "خريطة الشهر" : "خريطة السنة"}
            </h2>
            <WeekStrip
              from={startOfWeek(current)}
              recorded={new Set(
                series.points.filter((p) => p.habitsDue > 0 || p.energy !== null).map((p) => p.date)
              )}
            />
          </section>

          <section className="glass p-5">
            <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
              خريطة الحضور
            </h2>
            <HeatmapGrid cells={heat.cells} ariaLabel="خريطة الحضور" />
          </section>
        </div>
      )}

      {/* â”€â”€ Trends â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="mt-6 flex flex-col gap-6">
        <div className="glass p-5">
          <h2 className="display-arabic mb-1 text-sm font-semibold text-gold-light">الطاقة</h2>
          <p className="display-arabic mb-3 text-xs text-ink-3">
            {series.energyMean === null
              ? "لم تُسجَّل أي قراءات بعد."
              : `المعدّل ${series.energyMean.toFixed(1)} من ٥ عبر ${series.points.filter((p) => p.energy !== null).length} يوماً.`}
          </p>
          <DayBars points={series.points} field="energy" label="الطاقة" />
          <div className="mt-4">
            <TrendLine points={series.points} field="energy" label="الطاقة" />
          </div>
        </div>

        <div className="glass p-5">
          <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
            الفضائل الأربع
          </h2>
          <VirtueRadar axes={radar.axes} thin={radar.thin} />
        </div>

        <div className="glass p-5">
          <h2 className="display-arabic mb-1 text-sm font-semibold text-gold-light">
            العادات والطاقة
          </h2>
          <p className="display-arabic mb-3 text-xs leading-relaxed text-ink-3">
            كل نقطة يوم كتبت فيه تقييماً للطاقة، وموضعها يبيّن كم أنجزت من مستحقّاتك.
          </p>
          <HabitEnergyScatter points={scatterPoints} wording={correlation.wording} />
        </div>

        <div className="glass p-5">
          <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">هذا الأسبوع</h2>
          <p className="display-arabic text-sm leading-relaxed text-gold-muted">
            {weekSummary.daysRecorded === 0
              ? "لم تسجّل شيئاً هذا الأسبوع بعد."
              : `${weekSummary.daysRecorded} يوماً من ٧، و${weekSummary.journalEntries} كتابة في المفكرة.`}
          </p>
        </div>
      </section>

      {/* â”€â”€ Habits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="display-arabic text-sm font-semibold text-gold-light">العادات</h2>
          <button
            type="button"
            onClick={() => setShowAddHabit((v) => !v)}
            className="display-arabic flex items-center gap-1 text-xs text-gold-muted/70 hover:text-gold-light"
          >
            <Plus className="size-3.5" />
            {showAddHabit ? "إغلاق" : "عادة جديدة"}
          </button>
        </div>

        {showAddHabit && <AddHabitForm onDone={() => setShowAddHabit(false)} />}

        {habits.length === 0 ? (
          <EmptyPanel
            title="لا عادات بعد"
            body="أضف عادة واحدة لتبدأ. عادة واحدة تكفي في البداية، لأن نظام العادات هو ما يُهزم به الناس أنفسهم."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {habits.map((habit) => (
              <HabitRow key={habit.id} habit={habit} today={today} />
            ))}
          </ul>
        )}
      </section>

      {/* â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="mt-10">
        <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
          نسخة من مفكرتك
        </h2>
        <p className="display-arabic mb-3 text-xs leading-relaxed text-gold-muted/60">
          ملف كامل بما كتبته، يُحفظ عندك. لا يُرسل إلى أي جهة.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => doExport("json")}
            className="btn-ghost flex items-center gap-2 px-4 py-2.5 text-xs"
          >
            <FileJson className="size-3.5" />
            JSON
          </button>
          <button
            type="button"
            onClick={() => doExport("csv")}
            className="btn-ghost flex items-center gap-2 px-4 py-2.5 text-xs"
          >
            <Download className="size-3.5" />
            CSV
          </button>
          {!isMember && (
            <span className="display-arabic self-center text-[0.7rem] text-ink-3">
              التصدير متاح للجميع.
            </span>
          )}
        </div>
        {exporting && (
          <p role="status" className="display-arabic mt-3 text-xs text-gold-muted/70">
            أُنشئ الملف.
          </p>
        )}
      </section>

      {authState === "unavailable" && (
        <p className="display-arabic mt-8 text-center text-xs leading-relaxed text-ink-3">
          مفكرتك محفوظة على هذا الجهاز.{" "}
          <Link href="/enter" className="text-gold-light underline underline-offset-4">
            سجّل الدخول
          </Link>{" "}
          لتنقلها معك.
        </p>
      )}
      </div>
    </div>
  );

  function doExport(kind: "json" | "csv") {
    const state = useJournal.getState();
    const payload = buildExport({
      days: state.days,
      habits: state.habits,
      principles: state.principles,
      settings: state.settings,
    });
    const at = Date.now();
    if (kind === "json") {
      downloadText(exportFilename("json", at), toJson(payload), "application/json");
    } else {
      downloadText(exportFilename("csv", at), toCsv({ days: state.days, habits: state.habits }), "text/csv");
    }
    setExporting(true);
    setTimeout(() => setExporting(false), 2500);
  }
}

/**
 * Days between a habit's creation and a day, for an every-N-days schedule.
 *
 * Anchored on the habit's creation date so the rhythm is fixed and reproducible on
 * every device â€” anchoring on "today" would move the schedule each time the reader
 * opened the app, which is both wrong and maddening.
 */
function indexFor(habit: Habit, key: DayKey): number {
  const origin = new Date(habit.createdAt);
  const originKey = `${origin.getUTCFullYear()}-${String(origin.getUTCMonth() + 1).padStart(2, "0")}-${String(origin.getUTCDate()).padStart(2, "0")}`;
  const [oy, om, od] = originKey.split("-").map(Number) as [number, number, number];
  const [ky, km, kd] = key.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ky, km - 1, kd) - Date.UTC(oy, om - 1, od)) / 86_400_000);
}

/* â”€â”€ Day navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function DayNav({
  current,
  onPrev,
  onNext,
  onToday,
}: {
  current: DayKey;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const today = todayKey(useJournal.getState().settings.timeZone);
  const [y, m, d] = current.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS_AR[(date.getUTCDay() + 6) % 7];

  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPrev}
        aria-label="اليوم السابق"
        className="flex size-9 items-center justify-center rounded-full border border-gold/25 text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
      >
        â€¹
      </button>
      <div className="text-center">
        <p className="display-arabic text-sm font-semibold text-gold-light">{current}</p>
        <p className="display-arabic text-xs text-ink-3">{weekday?.long}</p>
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={current >= today}
        aria-label="اليوم التالي"
        className="flex size-9 items-center justify-center rounded-full border border-gold/25 text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light disabled:opacity-25"
      >
        â€º
      </button>
      {current !== today && (
        <button
          type="button"
          onClick={onToday}
          className="display-arabic ms-1 text-xs text-gold-muted/60 underline underline-offset-4 hover:text-gold-light"
        >
          اليوم
        </button>
      )}
    </div>
  );
}

/* â”€â”€ The day itself â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function DayPanel({ date }: { date: DayKey }) {
  const toggleHabit = useJournal((s) => s.toggleHabit);
  const setCheckIn = useJournal((s) => s.setCheckIn);
  const setMood = useJournal((s) => s.setMood);
  const setPractice = useJournal((s) => s.setPractice);
  const setVirtue = useJournal((s) => s.setVirtue);
  const habits = useJournal((s) => s.habits);
  const settings = useJournal((s) => s.settings);
  const day = useJournal((s) => s.days[date]);

  const due = habits.filter(
    (h) => !h.archived && isDueOn(h, date, indexFor(h, date))
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Habits */}
      {due.length > 0 && (
        <section className="glass p-5">
          <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">مستحقّات اليوم</h2>
          <ul className="flex flex-col gap-2">
            {due.map((habit) => {
              const ticked = day?.habits?.[habit.id]?.done ?? false;
              return (
                <li key={habit.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={ticked}
                    onClick={() => toggleHabit(date, habit.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-start transition-colors hover:bg-gold/[0.06]"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        ticked ? "border-gold bg-gold text-black" : "border-gold/35"
                      }`}
                    >
                      {ticked && <Check className="size-4" />}
                    </span>
                    <span
                      className={`display-arabic text-sm ${ticked ? "text-gold-muted/60 line-through" : "text-gold-light"}`}
                    >
                      {habit.title}
                    </span>
                  </button>
                  {habit.intention && (
                    <p className="display-arabic ps-9 text-xs leading-relaxed text-ink-3">
                      {habit.intention}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Check-in. Everything optional, nothing requested. */}
      <section className="glass p-5">
        <h2 className="display-arabic mb-1 text-sm font-semibold text-gold-light">متابعة اليوم</h2>
        <p className="display-arabic mb-4 text-xs leading-relaxed text-ink-3">
          كل ما هنا اختياري. اترك ما لا ينطبق.
        </p>

        <RatingRow
          label="الطاقة"
          value={day?.checkIn?.energy}
          onChange={(v) => setCheckIn(date, { energy: v })}
        />
        <RatingRow
          label="التركيز"
          value={day?.checkIn?.focus}
          onChange={(v) => setCheckIn(date, { focus: v })}
        />

        {/* Mood sits behind the consent switch above. Not buried in settings: the
            reader is told here, at the moment they would have been asked. */}
        {settings.aiJournalConsent ? (
          <RatingRow
            label="المزاج"
            value={day?.checkIn?.mood}
            onChange={(v) => setMood(date, v)}
          />
        ) : (
          <p className="display-arabic -mt-2 text-[0.7rem] leading-relaxed text-ink-3">
            المزاج لا يُطلب هنا. إن أردت تسجيله، فعّل القراءة من الأعلى.
          </p>
        )}
      </section>

      {/* Virtues */}
      <section className="glass p-5">
        <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
          تقييم الفضائل
        </h2>
        <div className="flex flex-col gap-3">
          {VIRTUES.map((virtue) => (
            <RatingRow
              key={virtue}
              label={VIRTUE_AR[virtue]}
              compact
              value={day?.virtues?.[virtue]}
              onChange={(v) => setVirtue(date, virtue, v)}
            />
          ))}
        </div>
      </section>

      {/* Practice */}
      <section className="glass p-5">
        <h2 className="display-arabic mb-3 text-sm font-semibold text-gold-light">
          ممارسة الفلسفة
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["read", "قرأتُ"],
              ["applied", "طبّقتُ"],
              ["reflected", "تأمّلتُ"],
            ] as const
          ).map(([key, label]) => {
            const on = day?.practice?.[key] ?? false;
            return (
              <button
                key={key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPractice(date, { [key]: !on })}
                className={`rounded-full border px-4 py-2 text-xs transition-colors ${
                  on
                    ? "border-gold/60 bg-gold/20 text-gold-light"
                    : "border-gold/20 text-gold-muted/70 hover:border-gold/45"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Journal templates */}
      <section className="flex flex-col gap-4">
        {TEMPLATES.map((template) => (
          <JournalBlock key={template.id} date={date} template={template} />
        ))}
      </section>
    </div>
  );
}

/** 1â€“5 as a row of buttons. Keyboard reachable, no drag, no slider. */
function RatingRow({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: Rating | undefined) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className={compact ? "" : "mb-4 last:mb-0"}>
      <span className="display-arabic mb-1.5 block text-xs text-gold-muted/70">{label}</span>
      <div ref={ref} className="flex gap-1.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              /* Tapping the current value clears it, so a mis-tap is undoable
                 without hunting for a "clear" control. */
              onClick={() => onChange(on ? undefined : (n as Rating))}
              className={`h-9 flex-1 rounded-lg border text-xs transition-colors ${
                on
                  ? "border-gold bg-gold/25 text-gold-light"
                  : "border-gold/18 text-gold-muted/60 hover:border-gold/45"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JournalBlock({
  date,
  template,
}: {
  date: DayKey;
  template: { id: JournalTemplate; title: string; hint: string };
}) {
  const day = useJournal((s) => s.days[date]);
  const writeJournal = useJournal((s) => s.writeJournal);
  const removeJournalBlock = useJournal((s) => s.removeJournalBlock);
  const existing = (day?.journal ?? []).filter((b) => b.template === template.id).pop();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(existing?.text ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(existing?.text ?? "");
  }, [existing?.text, existing?.updatedAt]);

  return (
    <section className="glass p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display-arabic text-sm font-semibold text-gold-light">{template.title}</h2>
        <div className="flex items-center gap-2">
          {saved && (
            <span role="status" className="display-arabic text-[0.65rem] text-gold-muted/60">
              حُفظ
            </span>
          )}
          {existing && !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="display-arabic text-[0.65rem] text-ink-3 underline underline-offset-4 hover:text-gold-light"
            >
              تعديل
            </button>
          )}
          {existing && (
            <button
              type="button"
              aria-label={`حذف ${template.title}`}
              onClick={() => {
                if (!existing) return;
                removeJournalBlock(date, template.id, existing.updatedAt);
                setDraft("");
              }}
              className="text-ink-3 hover:text-gold-light"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="display-arabic mt-1 mb-3 text-xs leading-relaxed text-ink-3">
        {template.hint}
      </p>

      {open || !existing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            writeJournal(date, {
              template: template.id,
              text,
              updatedAt: Date.now(),
            });
            setSaved(true);
            setOpen(false);
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          <label htmlFor={`journal-${template.id}`} className="sr-only">
            {template.title}
          </label>
          <textarea
            id={`journal-${template.id}`}
            dir="auto"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="اكتب…"
            className="field w-full resize-none py-3 text-[0.95rem] leading-loose"
          />
          <button type="submit" disabled={!draft.trim()} className="btn-ghost mt-3 px-5 py-2.5 text-xs disabled:opacity-35">
            حفظ
          </button>
        </form>
      ) : (
        <p dir="auto" className="display-arabic whitespace-pre-wrap text-[0.95rem] leading-loose text-gold-muted">
          {existing.text}
        </p>
      )}
    </section>
  );
}

/* â”€â”€ Principles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function PrinciplesPanel() {
  const principles = useJournal((s) => s.principles);
  const addPrinciple = useJournal((s) => s.addPrinciple);
  const removePrinciple = useJournal((s) => s.removePrinciple);
  const [draft, setDraft] = useState("");

  return (
    <section className="glass mb-6 p-5">
      <h2 className="display-arabic mb-1 text-sm font-semibold text-gold-light">مبادئي</h2>
      <p className="display-arabic mb-4 text-xs leading-relaxed text-ink-3">
        كلماتك أنت. تظهر مع كل يوم.
      </p>

      {principles.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {principles.map((principle) => (
            <li key={principle.id} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-gold/60" />
              <p dir="auto" className="display-arabic flex-1 text-sm leading-relaxed text-gold-light">
                {principle.text}
              </p>
              <button
                type="button"
                aria-label={`حذف ${principle.text}`}
                onClick={() => removePrinciple(principle.id)}
                className="mt-1 text-ink-3 hover:text-gold-light"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          addPrinciple(draft);
          setDraft("");
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="principle-input" className="sr-only">
          مبدأ جديد
        </label>
        <input
          id="principle-input"
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="ما المبدأ الذي تحكم يومك؟"
          className="field flex-1 py-2.5 text-sm"
        />
        <button type="submit" disabled={!draft.trim()} className="btn-ghost px-4 py-2.5 text-xs disabled:opacity-35">
          أضف
        </button>
      </form>
    </section>
  );
}

/* â”€â”€ Habits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function HabitRow({ habit, today }: { habit: Habit; today: DayKey }) {
  const day = useJournal((s) => s.days[today]);
  const toggleHabit = useJournal((s) => s.toggleHabit);
  const archiveHabit = useJournal((s) => s.archiveHabit);
  const deleteHabit = useJournal((s) => s.deleteHabit);

  const ticked = day?.habits?.[habit.id]?.done ?? false;

  const schedule =
    habit.everyNDays && habit.everyNDays > 1
      ? `كل ${habit.everyNDays} أيام`
      : habit.weekdays.length === 0 || habit.weekdays.length === 7
        ? "يومياً"
        : habit.weekdays
            .slice()
            .sort((a, b) => a - b)
            .map((d) => WEEKDAYS_AR[d]?.short ?? "")
            .filter(Boolean)
            .join(" ");

  return (
    <li className={`glass flex items-center gap-3 px-4 py-3 ${habit.archived ? "opacity-55" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={ticked}
        aria-label={habit.title}
        disabled={habit.archived}
        onClick={() => toggleHabit(today, habit.id)}
        className={`flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${
          ticked ? "border-gold bg-gold text-black" : "border-gold/35"
        }`}
      >
        {ticked && <Check className="size-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`display-arabic truncate text-sm ${habit.archived ? "text-ink-3 line-through" : "text-gold-light"}`}>
          {habit.title}
        </p>
        <p className="display-arabic text-xs text-ink-3">{schedule}</p>
      </div>
      <button
        type="button"
        aria-label={habit.archived ? `إعادة تفعيل ${habit.title}` : `أرشفة ${habit.title}`}
        onClick={() => archiveHabit(habit.id, !habit.archived)}
        className="shrink-0 text-ink-3 hover:text-gold-light"
      >
        <Archive className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`حذف ${habit.title}`}
        onClick={() => deleteHabit(habit.id)}
        className="shrink-0 text-ink-3 hover:text-gold-light"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function AddHabitForm({ onDone }: { onDone: () => void }) {
  const addHabit = useJournal((s) => s.addHabit);
  const settings = useJournal((s) => s.settings);
  const habits = useJournal((s) => s.habits);
  const [title, setTitle] = useState("");
  const [intention, setIntention] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [refused, setRefused] = useState(false);

  const atLimit = habits.filter((h) => !h.archived).length >= settings.habitsLimit;

  if (atLimit) {
    return (
      <div className="glass mb-3 p-4">
        <p className="display-arabic text-sm leading-relaxed text-gold-muted">
          بلغت الحدّ في الخطة المجانية: {settings.habitsLimit} عادات.
        </p>
        <p className="display-arabic mt-2 text-xs leading-relaxed text-ink-3">
          ثلاث عادات تُحمل فعلاً. إن أردت المزيد، فالأرشفة تفتح مكاناً، والعضوية ترفع الحدّ.
        </p>
      </div>
    );
  }

  return (
    <form
      className="glass mb-3 flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = title.trim();
        if (!clean) return;
        const created = addHabit({
          title: clean,
          ...(intention.trim() ? { intention: intention.trim() } : {}),
          weekdays,
          grace: 1,
          order: habits.length,
        });
        if (!created) {
          setRefused(true);
          return;
        }
        setTitle("");
        setIntention("");
        setWeekdays([]);
        onDone();
      }}
    >
      <label htmlFor="habit-title" className="sr-only">
        اسم العادة
      </label>
      <input
        id="habit-title"
        dir="auto"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="ما العادة؟"
        className="field py-2.5 text-sm"
      />

      <label htmlFor="habit-intention" className="sr-only">
        لماذا يهمّ
      </label>
      <input
        id="habit-intention"
        dir="auto"
        value={intention}
        onChange={(e) => setIntention(e.target.value)}
        placeholder="لماذا يهمّك هذا؟ (اختياري)"
        className="field py-2.5 text-sm"
      />

      <fieldset>
        <legend className="display-arabic mb-1.5 text-xs text-gold-muted/60">
          أيام الاستحقاق
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS_AR.map((day, i) => {
            const on = weekdays.includes(i);
            return (
              <button
                key={day.short}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setWeekdays((prev) => (on ? prev.filter((d) => d !== i) : [...prev, i]))
                }
                className={`display-arabic size-9 rounded-lg border text-xs transition-colors ${
                  on ? "border-gold/60 bg-gold/20 text-gold-light" : "border-gold/20 text-gold-muted/60"
                }`}
              >
                {day.short}
              </button>
            );
          })}
        </div>
        <p className="display-arabic mt-1.5 text-[0.7rem] text-ink-3">
          {weekdays.length === 0 ? "بلا تحديد — أي يوم." : "في هذه الأيام فقط."}
        </p>
      </fieldset>

      {refused && (
        <p role="alert" className="display-arabic text-xs text-gold-light">
          بلغت حدّ العادات في الخطة المجانية.
        </p>
      )}

      <button type="submit" disabled={!title.trim()} className="btn-ghost self-start px-5 py-2.5 text-xs disabled:opacity-35">
        أضف العادة
      </button>
    </form>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass p-6 text-center">
      <p className="display-arabic text-sm font-semibold text-gold-light">{title}</p>
      <p className="display-arabic mt-2 text-xs leading-relaxed text-gold-muted/60">{body}</p>
    </div>
  );
}

export default JournalApp;
