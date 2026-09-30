import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Tier = "free" | "oracle" | "sanctum";

export interface DailyEntry {
  id: string;
  kind: "habit" | "thought" | "time";
  text: string;
  createdAt: string;
}

interface AppState {
  freeInteractions: number;
  increment: () => void;
  setFreeInteractions: (count: number) => void;
  tier: Tier;
  setTier: (t: Tier) => void;
  uid: string | null;
  setIdentity: (uid: string | null) => void;
  entries: DailyEntry[];
  setEntries: (entries: DailyEntry[]) => void;
  addEntry: (entry: DailyEntry) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      freeInteractions: 0,
      increment: () => set((s) => ({ freeInteractions: s.freeInteractions + 1 })),
      setFreeInteractions: (freeInteractions) => set({ freeInteractions: Math.max(0, freeInteractions) }),
      tier: "free",
      setTier: (tier) => set({ tier }),
      uid: null,
      setIdentity: (uid) => set({ uid }),
      entries: [],
      setEntries: (entries) => set({ entries }),
      addEntry: (entry) => set((state) => ({ entries: [entry, ...state.entries] })),
    }),
    {
      name: "mindinbox-store",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return localStorage;
        return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
      }),
    }
  )
);
