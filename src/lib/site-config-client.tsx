"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { db, paths } from "@/lib/firebase";
import {
  FALLBACK_SITE_CONFIG,
  normalisePricing,
  type PricingTier,
  type SiteConfig,
} from "@/lib/site-config";

/**
 * Site configuration provider.
 *
 * Ships `FALLBACK_SITE_CONFIG` synchronously so pricing renders on first paint
 * with no spinner and no layout shift, then upgrades to the admin-authored
 * `siteConfig/*` documents if and only if they pass `normalise*`. A malformed
 * document is ignored rather than thrown: a bad config must not take the site
 * down, and nav/pricing are display data, never an authorisation surface.
 *
 * Prompt 14 will let the admin edit these through drag-and-drop; the
 * validation boundary above is what that will depend on.
 */

interface SiteConfigCtx extends SiteConfig {
  /** Which copy is live. Surfaced in the UI so it is never hidden. */
  source: "fallback" | "remote";
}

const Ctx = createContext<SiteConfigCtx | null>(null);

const FALLBACK: SiteConfigCtx = { ...FALLBACK_SITE_CONFIG, source: "fallback" };

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteConfigCtx>(FALLBACK);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, paths.pricingDoc),
      (snap) => {
        if (!snap.exists()) return;
        const parsed = normalisePricing(snap.data()?.tiers);
        if (parsed) setState({ pricing: parsed, source: "remote" });
      },
      () => undefined
    );
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** Site config, with the static default as the floor. */
export function useSiteConfig(): SiteConfigCtx {
  return useContext(Ctx) ?? FALLBACK;
}

export function usePricingConfig(): { tiers: PricingTier[]; source: SiteConfigCtx["source"] } {
  const { pricing, source } = useSiteConfig();
  return useMemo(() => ({ tiers: pricing, source }), [pricing, source]);
}
