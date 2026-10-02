"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Tier } from "./tiers";
import { TIER_ORDER } from "./tiers";

export type EntryKind = "habit" | "thought" | "time";

export interface DailyEntry {
  id: string;
  kind: EntryKind;
  text: string;
  /** Epoch ms. */
  createdAt: number;
}

export interface PuzzleRecord {
  symbolId: number;
  solvedAt: number;
}

interface AppState {
  /* ── Identity ── */
  uid: string | null;
  email: string | null;
  displayName: string | null;
  /** True only when the server-verified token carries `admin: true`. */
  isAdmin: boolean;
  /** Null until Firebase auth has resolved — avoids a false "anonymous" flash. */
  authResolved: boolean;

  /* ── Membership ── */
  tier: Tier;
  /** ISO string or epoch ms; null when no trial was granted. */
  trialEnd: string | null;

  /* ── Preferences ── */
  philosopherId: string;
  /** Cached advisor prices from `siteConfig/pricing`. */
  pricing: Partial<Record<Tier, number>>;

  /* ── AI metering ── */
  /** Server-reported attempts left in the anonymous window. */
  attemptsLeft: number | null;
  gateOpen: boolean;

  /* ── Local tracker mirror (Firestore is the source of truth) ── */
  entries: DailyEntry[];
  puzzles: PuzzleRecord[];

  /* ── Actions ── */
  setIdentity: (patch: {
    uid: string | null;
    email?: string | null;
    displayName?: string | null;
    isAdmin?: boolean;
  }) => void;
  setAuthResolved: (resolved: boolean) => void;
  setMembership: (tier: Tier, trialEnd: string | null) => void;
  setPhilosopher: (id: string) => void;
  setPricing: (pricing: Partial<Record<Tier, number>>) => void;
  setAttemptsLeft: (n: number | null) => void;
  openGate: () => void;
  closeGate: () => void;
  setEntries: (entries: DailyEntry[]) => void;
  addEntry: (entry: DailyEntry) => void;
  removeEntry: (id: string) => void;
  recordPuzzle: (symbolId: number) => void;
  reset: () => void;
}

/**
 * Local mirror of the user's tracker so the UI can paint instantly while
 * Firestore hydrates from cache/offline.
 */
const initialState = {
  uid: null,
  email: null,
  displayName: null,
  isAdmin: false,
  authResolved: false,
  tier: "free" as Tier,
  trialEnd: null,
  philosopherId: "plato",
  pricing: {},
  attemptsLeft: null,
  gateOpen: false,
  entries: [] as DailyEntry[],
  puzzles: [] as PuzzleRecord[],
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,

      setIdentity: (patch) =>
        set((state) => ({
          uid: patch.uid,
          email: patch.email ?? null,
          displayName: patch.displayName ?? null,
          // Never downgrade from a verified admin to anonymous.
          isAdmin: state.isAdmin && patch.uid === state.uid ? true : patch.isAdmin ?? false,
          authResolved: true,
        })),

      setAuthResolved: (authResolved) => set({ authResolved }),

      setMembership: (tier, trialEnd) =>
        set((state) =>
          // Guard against a stale/offline read downgrading a paying member.
          TIER_ORDER[state.tier] > TIER_ORDER[tier] ? state : { tier, trialEnd }
        ),

      setPhilosopher: (philosopherId) => set({ philosopherId }),
      setPricing: (pricing) => set({ pricing }),

      setAttemptsLeft: (attemptsLeft) =>
        set((state) => ({
          attemptsLeft,
          // While attempts remain there is nothing to gate.
          gateOpen:
            attemptsLeft !== null && attemptsLeft > 0 ? false : state.gateOpen,
        })),

      openGate: () => set({ gateOpen: true }),
      closeGate: () => set({ gateOpen: false }),

      setEntries: (entries) =>
        set({
          entries: [...entries].sort((a, b) => b.createdAt - a.createdAt),
        }),

      addEntry: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 400),
        })),

      removeEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      recordPuzzle: (symbolId) =>
        set((state) =>
          state.puzzles.some((p) => p.symbolId === symbolId)
            ? state
            : { puzzles: [...state.puzzles, { symbolId, solvedAt: Date.now() }] }
        ),

      reset: () => set({ ...initialState, authResolved: true }),
    }),
    {
      name: "mindinbox-store",
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return localStorage;
        return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
      }),
      // Identity and entitlement are re-derived from Firebase on every load.
      partialize: (state) => ({
        philosopherId: state.philosopherId,
        entries: state.entries,
        puzzles: state.puzzles,
      }),
    }
  )
);

/* ── Selectors ── */

export const selectIsSignedIn = (s: AppState) => Boolean(s.uid);
export const selectEntriesForDay = (day: number) => (s: AppState) =>
  s.entries.filter((e) => new Date(e.createdAt).getDate() === day);