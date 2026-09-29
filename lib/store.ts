import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type SubscriptionTier = 'free' | 'oracle' | 'sanctum';

interface AppState {
  freeInteractions: number;
  incrementFreeInteractions: () => void;
  subscriptionTier: SubscriptionTier;
  setSubscriptionTier: (tier: SubscriptionTier) => void;
  hasSeenIntro: boolean;
  setHasSeenIntro: (seen: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      freeInteractions: 0,
      incrementFreeInteractions: () => set((state) => ({ freeInteractions: state.freeInteractions + 1 })),
      subscriptionTier: 'free',
      setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),
      hasSeenIntro: false,
      setHasSeenIntro: (seen) => set({ hasSeenIntro: seen }),
    }),
    {
      name: 'mindinbox-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
