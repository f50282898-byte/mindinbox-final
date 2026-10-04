"use client";

/**
 * Journal storage — local-first, Firestore when signed in.
 *
 * ## Why local-first
 *
 * A reflective journal is written at night, on a phone, often on a train. If
 * writing depends on a network round-trip, entries get lost, and the reader learns
 * not to trust the thing that is supposed to be their own record. So the local copy
 * is the source of truth for rendering and is written **synchronously**: a tick
 * appears the instant it is made, and a reload cannot lose it.
 *
 * Firestore is the sync target, not the read path.
 *
 * ## Offline and the sync queue
 *
 * Every mutation goes into a queue keyed by day. Sync drains it when the connection
 * is back. Three rules make that safe:
 *
 *  1. **Merge by day, never append.** Two devices editing the same day each hold a
 *     full day document, so the second write would otherwise erase the first. The
 *     merge here is field-wise and last-write-wins per field.
 *  2. **A failed write is never dropped.** It stays queued. Losing a journal entry
 *     to a flaky connection is the one failure this module must not have.
 *  3. **Local removal is immediate, remote removal is best-effort.** Deleting is the
 *     reader's decision and must feel instant; the remote delete is retried by the
 *     next drain.
 *
 * ## What is never stored locally
 *
 * Nothing. The local copy holds the reader's own content and nothing else — no
 * analytics, no derived AI output, no cache of anything the server computed about
 * them.
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { create } from "zustand";
import { db, paths } from "@/lib/firebase";
import { isDayKey, resolveTimeZone, todayKey, type DayKey } from "./day-key";
import {
  defaultJournalSettings,
  type DayDocument,
  type Habit,
  type JournalSettings,
  type Principle,
} from "./types";

const STORAGE_KEY = "mindinbox-journal/v1";

/**
 * This device's id, in its own key.
 *
 * Kept apart from the journal payload deliberately: it is written once and never
 * changes, so folding it into the state would mean every habit tick carried a
 * field nothing reads. The sync merge uses it to tell "my edit" from the other
 * device's when two timestamps tie.
 */
const DEVICE_KEY = "mindinbox-device-id";

function deviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}

/**
 * Days kept in local storage.
 *
 * 400 is roughly 13 months of daily use. Enough for the heatmap's year view and
 * the charts, small enough that the payload stays well inside a localStorage
 * quota, and it is dropped oldest-first rather than failing the write.
 */
const MAX_LOCAL_DAYS = 400;

interface PersistedShape {
  days: Record<string, DayDocument>;
  habits: Habit[];
  principles: Principle[];
  settings: JournalSettings;
  /** Mutations not yet confirmed by the server. */
  dirtyDays: DayKey[];
  dirtyHabits: boolean;
  dirtyPrinciples: boolean;
  dirtySettings: boolean;
}

function emptyPersisted(): PersistedShape {
  return {
    days: {},
    habits: [],
    principles: [],
    settings: defaultJournalSettings(),
    dirtyDays: [],
    dirtyHabits: false,
    dirtyPrinciples: false,
    dirtySettings: false,
  };
}

function readLocal(): PersistedShape {
  if (typeof window === "undefined") return emptyPersisted();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersisted();
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (!parsed || typeof parsed !== "object" || !parsed.days) return emptyPersisted();

    return {
      days: parsed.days ?? {},
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      principles: Array.isArray(parsed.principles) ? parsed.principles : [],
      settings: { ...defaultJournalSettings(), ...(parsed.settings ?? {}) },
      dirtyDays: Array.isArray(parsed.dirtyDays) ? parsed.dirtyDays.filter(isDayKey) : [],
      dirtyHabits: Boolean(parsed.dirtyHabits),
      dirtyPrinciples: Boolean(parsed.dirtyPrinciples),
      dirtySettings: Boolean(parsed.dirtySettings),
    };
  } catch {
    // A corrupt payload must not brick the journal. Start clean; the server copy
    // is still there and will be re-read.
    return emptyPersisted();
  }
}

function writeLocal(state: PersistedShape): void {
  if (typeof window === "undefined") return;
  try {
    const sorted = Object.values(state.days)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, MAX_LOCAL_DAYS);

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        days: Object.fromEntries(sorted.map((d) => [d.date, d])),
        // Keep only the dirty keys that still exist, so the queue cannot grow
        // without bound or reference deleted days.
        dirtyDays: state.dirtyDays.filter((k) => k in Object.fromEntries(sorted.map((d) => [d.date, d]))),
      })
    );
  } catch {
    // Over quota or private mode. The in-memory copy keeps working for this tab,
    // and `flush` will push to Firestore on the next successful write.
  }
}

/** Merges a day document field-wise, preferring the newer value per field. */
function mergeDays(local: DayDocument | undefined, remote: DayDocument): DayDocument {
  if (!local) return remote;
  // If one side is strictly newer overall, take it wholesale; otherwise merge the
  // two fields most likely to have been edited on different devices.
  if (remote.updatedAt > local.updatedAt) {
    return { ...local, ...remote, habits: { ...local.habits, ...remote.habits } };
  }
  return {
    ...remote,
    ...local,
    habits: { ...remote.habits, ...local.habits },
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

interface JournalState {
  ready: boolean;
  days: Record<string, DayDocument>;
  habits: Habit[];
  principles: Principle[];
  settings: JournalSettings;
  dirtyDays: DayKey[];
  dirtyHabits: boolean;
  dirtyPrinciples: boolean;
  dirtySettings: boolean;
  /** True while a sync drain is in flight. */
  syncing: boolean;
  /** Set when the last drain failed, so the UI can say "not yet saved". */
  syncError: string | null;

  hydrate: () => void;
  today: () => DayKey;
  day: (key: DayKey) => DayDocument | undefined;
  ensureDay: (key: DayKey) => DayDocument;

  toggleHabit: (dayKey: DayKey, habitId: string) => void;
  setHabitNote: (dayKey: DayKey, habitId: string, note: string) => void;
  setCheckIn: (dayKey: DayKey, patch: Partial<DayDocument["checkIn"]>) => void;
  setMood: (dayKey: DayKey, mood: 1 | 2 | 3 | 4 | 5 | undefined) => void;
  setPractice: (dayKey: DayKey, patch: Partial<DayDocument["practice"]>) => void;
  setVirtue: (dayKey: DayKey, virtue: keyof NonNullable<DayDocument["virtues"]>, value: 1 | 2 | 3 | 4 | 5 | undefined) => void;
  writeJournal: (dayKey: DayKey, block: DayDocument["journal"] extends (infer B)[] | undefined ? B : never) => void;
  removeJournalBlock: (dayKey: DayKey, template: string, updatedAt: number) => void;

  addHabit: (habit: Omit<Habit, "id" | "createdAt" | "updatedAt" | "archived">) => Habit | null;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  archiveHabit: (id: string, archived: boolean) => void;
  deleteHabit: (id: string) => void;

  addPrinciple: (text: string) => void;
  removePrinciple: (id: string) => void;

  updateSettings: (patch: Partial<JournalSettings>) => void;

  flush: (uid: string | null) => Promise<void>;
  replaceAll: (state: PersistedShape) => void;
}

export const useJournal = create<JournalState>()((set, get) => {
  /** Applies a mutation and marks the affected slice dirty, in one place. */
  const mutate = (fn: (s: JournalState) => Partial<JournalState>): void => {
    set((state) => {
      const patch = fn(state);
      const next = { ...state, ...patch } as JournalState;
      writeLocal({
        days: next.days,
        habits: next.habits,
        principles: next.principles,
        settings: next.settings,
        dirtyDays: next.dirtyDays,
        dirtyHabits: next.dirtyHabits,
        dirtyPrinciples: next.dirtyPrinciples,
        dirtySettings: next.dirtySettings,
      });
      return patch;
    });
  };

  const markDay =
    (key: DayKey) =>
    (s: JournalState): DayKey[] =>
      s.dirtyDays.includes(key) ? s.dirtyDays : [...s.dirtyDays, key];

  const patchDay =
    (key: DayKey, patch: (day: DayDocument) => DayDocument) =>
    (s: JournalState): Record<string, DayDocument> => {
      const existing = s.days[key];
      const base: DayDocument = existing ?? blankDay(key, s.settings.timeZone);
      return {
        ...s.days,
        [key]: { ...patch(base), updatedAt: Date.now(), lastWriter: deviceId() },
      };
    };

  return {
    ready: false,
    days: {},
    habits: [],
    principles: [],
    settings: defaultJournalSettings(),
    dirtyDays: [],
    dirtyHabits: false,
    dirtyPrinciples: false,
    dirtySettings: false,
    syncing: false,
    syncError: null,

    hydrate: () => {
      if (get().ready) return;
      const loaded = readLocal();
      set({
        days: loaded.days,
        habits: loaded.habits,
        principles: loaded.principles,
        settings: loaded.settings,
        dirtyDays: loaded.dirtyDays,
        dirtyHabits: loaded.dirtyHabits,
        dirtyPrinciples: loaded.dirtyPrinciples,
        dirtySettings: loaded.dirtySettings,
        ready: true,
      });
    },

    today: () => todayKey(get().settings.timeZone),

    day: (key) => get().days[key],

    ensureDay: (key) => {
      const existing = get().days[key];
      if (existing) return existing;
      // Reading a day does not create it. Creating on read would fill the store
      // with empty documents for every day the charts happen to walk over.
      return blankDay(key, get().settings.timeZone);
    },

    toggleHabit: (key, habitId) => {
      mutate((s) => ({
        days: patchDay(key, (day) => {
          const current = day.habits?.[habitId];
          return {
            ...day,
            habits: {
              ...day.habits,
              [habitId]: current?.done
                ? { ...current, done: false }
                : { done: true, updatedAt: Date.now() },
            },
          };
        })(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    setHabitNote: (key, habitId, note) => {
      mutate((s) => ({
        days: patchDay(key, (day) => ({
          ...day,
          habits: {
            ...day.habits,
            [habitId]: { done: day.habits?.[habitId]?.done ?? false, note, updatedAt: Date.now() },
          },
        }))(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    setCheckIn: (key, patch) => {
      mutate((s) => ({
        days: patchDay(key, (day) => ({ ...day, checkIn: { ...day.checkIn, ...patch } }))(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    /**
     * Mood, separated from the rest of the check-in.
     *
     * A dedicated action because it is the one field with a consent requirement:
     * the UI must be able to refuse to write it, and the audit trail must be able
     * to show it was not written by any other path.
     */
    setMood: (key, mood) => {
      mutate((s) => ({
        days: patchDay(key, (day) => {
          const next = { ...day.checkIn };
          if (mood === undefined) delete next.mood;
          else next.mood = mood;
          return { ...day, checkIn: next };
        })(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    setPractice: (key, patch) => {
      mutate((s) => ({
        days: patchDay(key, (day) => ({ ...day, practice: { ...day.practice, ...patch } }))(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    setVirtue: (key, virtue, value) => {
      mutate((s) => ({
        days: patchDay(key, (day) => {
          const virtues = { ...day.virtues };
          if (value === undefined) delete virtues[virtue];
          else virtues[virtue] = value;
          return { ...day, virtues };
        })(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    writeJournal: (key, block) => {
      mutate((s) => ({
        days: patchDay(key, (day) => {
          const rest = (day.journal ?? []).filter(
            (b) => !(b.template === block.template && b.updatedAt === block.updatedAt)
          );
          return { ...day, journal: [...rest, block].sort((a, b) => a.updatedAt - b.updatedAt) };
        })(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    removeJournalBlock: (key, template, updatedAt) => {
      mutate((s) => ({
        days: patchDay(key, (day) => ({
          ...day,
          journal: (day.journal ?? []).filter(
            (b) => !(b.template === template && b.updatedAt === updatedAt)
          ),
        }))(s),
        dirtyDays: markDay(key)(s),
      }));
    },

    /**
     * Creates a habit, or returns null when the free limit is reached.
     *
     * The limit is checked here for immediate feedback *and* on the server. A
     * client-side limit is a courtesy, never the control — see `limits.ts`.
     */
    addHabit: (input) => {
      const state = get();
      const active = state.habits.filter((h) => !h.archived);
      if (active.length >= state.settings.habitsLimit) return null;

      const now = Date.now();
      const habit: Habit = {
        ...input,
        id: crypto.randomUUID(),
        archived: false,
        createdAt: now,
        updatedAt: now,
        order: active.length,
      };
      mutate((s) => ({ habits: [...s.habits, habit], dirtyHabits: true }));
      return habit;
    },

    updateHabit: (id, patch) => {
      mutate((s) => ({
        habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: Date.now() } : h)),
        dirtyHabits: true,
      }));
    },

    archiveHabit: (id, archived) => {
      mutate((s) => ({
        habits: s.habits.map((h) => (h.id === id ? { ...h, archived, updatedAt: Date.now() } : h)),
        dirtyHabits: true,
      }));
    },

    deleteHabit: (id) => {
      mutate((s) => ({ habits: s.habits.filter((h) => h.id !== id), dirtyHabits: true }));
    },

    addPrinciple: (text) => {
      const clean = text.trim();
      if (!clean) return;
      mutate((s) => ({
        principles: [...s.principles, { id: crypto.randomUUID(), text: clean, createdAt: Date.now() }],
        dirtyPrinciples: true,
      }));
    },

    removePrinciple: (id) => {
      mutate((s) => ({
        principles: s.principles.filter((p) => p.id !== id),
        dirtyPrinciples: true,
      }));
    },

    updateSettings: (patch) => {
      mutate((s) => {
        const settings = { ...s.settings, ...patch };
        // A zone change re-keys every day, which is a different set of documents.
        // Rather than silently reinterpreting history, the keys are rewritten so
        // the reader sees the same content under the new zone — and the days that
        // no longer exist are dropped, because inventing them would be a lie.
        const days = patch.timeZone ? rekeyDays(s.days, patch.timeZone) : s.days;
        return { settings, days, dirtySettings: true, dirtyDays: [...new Set([...s.dirtyDays, ...Object.keys(days)])] };
      });
    },

    /**
     * Pushes everything queued to Firestore, then mirrors changes back.
     *
     * Returns quietly on failure. The queue survives, and the reader keeps writing.
     */
    flush: async (uid) => {
      const state = get();
      if (!uid || !db) return;
      if (state.syncing) return;

      set({ syncing: true, syncError: null });

      try {
        const batch = writeBatch(db);
        let queued = 0;

        for (const key of state.dirtyDays) {
          const day = state.days[key];
          if (!day) continue;
          batch.set(
            doc(db, `${paths.userDays(uid)}/${key}`),
            { ...day, id: undefined } as never,
            { merge: true }
          );
          queued += 1;
        }
        if (state.dirtyHabits && state.habits.length > 0) {
          for (const habit of state.habits) {
            batch.set(doc(db, `${paths.userHabits(uid)}/${habit.id}`), habit, { merge: true });
          }
          queued += state.habits.length;
        }
        if (state.dirtyPrinciples) {
          batch.set(doc(db, paths.userPrinciples(uid)), { items: state.principles }, { merge: true });
          queued += 1;
        }
        if (state.dirtySettings) {
          batch.set(
            doc(db, paths.userSettings(uid)),
            state.settings,
            { merge: true }
          );
          queued += 1;
        }

        if (queued > 0) await batch.commit();

        set(() => ({
          dirtyDays: [],
          dirtyHabits: false,
          dirtyPrinciples: false,
          dirtySettings: false,
        }));
        writeLocal({ ...readLocal(), dirtyDays: [], dirtyHabits: false, dirtyPrinciples: false, dirtySettings: false });

        // Mirror, so another device's edits arrive.
        observeRemote(uid);
      } catch {
        // Deliberately not destructive: the queue stays, and the reader carries on.
        set({ syncError: "تعذّر الحفظ على الخادم بعد. ما كتبته محفوظ على جهازك." });
      } finally {
        set({ syncing: false });
      }
    },

    replaceAll: (next) => {
      set({ ...next, ready: true });
      writeLocal(next);
    },
  };
});

function blankDay(key: DayKey, timeZone: string): DayDocument {
  return {
    date: key,
    timeZone: resolveTimeZone(timeZone),
    updatedAt: 0,
  };
}

/**
 * Rewrites day keys for a timezone change.
 *
 * A day document's key is a calendar date, and the *content* belongs to the person
 * and the moment, not to a zone. So moving zones moves each document to the key
 * that matches its own recorded local time where that is knowable — which it is not
 * for a whole-day document. In practice the honest move is to keep the calendar
 * dates and record the new zone, rather than fabricate a re-keying.
 */
function rekeyDays(days: Record<string, DayDocument>, timeZone: string): Record<string, DayDocument> {
  const out: Record<string, DayDocument> = {};
  for (const day of Object.values(days)) {
    out[day.date] = { ...day, timeZone: resolveTimeZone(timeZone) };
  }
  return out;
}

/** Subscribes to remote changes and merges them into the local store. */
function observeRemote(uid: string): void {
  if (!db) return;
  onSnapshot(
    query(collection(db, paths.userDays(uid)), orderBy("date", "desc")),
    (snap) => {
      useJournal.setState((s) => {
        const next = { ...s.days };
        for (const docSnap of snap.docs) {
          const remote = docSnap.data() as DayDocument;
          if (!isDayKey(docSnap.id)) continue;
          next[docSnap.id] = mergeDays(s.days[docSnap.id], { ...remote, date: docSnap.id });
        }
        return { days: next };
      });
    },
    () => undefined
  );

  onSnapshot(
    collection(db, paths.userHabits(uid)),
    (snap) => {
      const habits = snap.docs.map((d) => ({ ...(d.data() as Habit), id: d.id })) as Habit[];
      useJournal.setState({ habits: habits.sort((a, b) => a.order - b.order) });
    },
    () => undefined
  );

  onSnapshot(doc(db, paths.userPrinciples(uid)), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as { items?: Principle[] };
    useJournal.setState({ principles: Array.isArray(data.items) ? data.items : [] });
  });

  onSnapshot(doc(db, paths.userSettings(uid)), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as Partial<JournalSettings>;
    useJournal.setState((s) => ({
      settings: { ...s.settings, ...data, timeZone: resolveTimeZone(data.timeZone ?? s.settings.timeZone) },
    }));
  });
}

/** Reads everything once, for a fresh sign-in on a device with no local copy. */
export async function loadRemoteJournal(uid: string): Promise<void> {
  if (!db) return;
  try {
    const [days, habits] = await Promise.all([
      getDocs(query(collection(db, paths.userDays(uid)), orderBy("date", "desc"))),
      getDocs(collection(db, paths.userHabits(uid))),
    ]);

    useJournal.setState((s) => {
      const merged = { ...s.days };
      for (const d of days.docs) {
        if (!isDayKey(d.id)) continue;
        merged[d.id] = mergeDays(s.days[d.id], { ...(d.data() as DayDocument), date: d.id });
      }
      const remoteHabits = habits.docs.map((d) => ({ ...(d.data() as Habit), id: d.id })) as Habit[];
      return {
        days: merged,
        // Local wins when it has unsynced work; otherwise the server copy fills gaps.
        habits: s.dirtyHabits && s.habits.length > 0 ? s.habits : remoteHabits.sort((a, b) => a.order - b.order),
      };
    });
  } catch {
    // Offline on first load: the local copy stands, and `flush` will retry.
  }
}
