import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Tier = "free" | "oracle" | "sanctum";

interface AppState {
  freeInteractions: number;
  increment: () => void;
  tier: Tier;
  setTier: (t: Tier) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      freeInteractions: 0,
      increment: () => set((s) => ({ freeInteractions: s.freeInteractions + 1 })),
      tier: "free",
      setTier: (tier) => set({ tier }),
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
