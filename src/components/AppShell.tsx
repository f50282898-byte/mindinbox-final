"use client";

import { useEffect, useState, type ReactNode } from "react";
import { auth, db, paths } from "@/lib/firebase";
import { useSession, useSessionTelemetry } from "@/lib/session";
import { useAppStore } from "@/lib/store";
import { sanitizePricing } from "@/lib/tiers";
import { doc, getDoc } from "firebase/firestore";
import { GateModal } from "@/components/GateModal";
import { MembershipBanner } from "@/components/MembershipBanner";
import { GoldenSymbols } from "@/components/GoldenSymbols";

/**
 * Client shell.
 *
 * Owns the cross-cutting concerns that every page needs exactly once:
 * auth resolution, telemetry, pricing config, the membership banner, the
 * hidden-symbol puzzle layer, and the paywall Gate.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, uid } = useSession();
  useSessionTelemetry(state === "member");

  const setPricing = useAppStore((s) => s.setPricing);
  const gateOpen = useAppStore((s) => s.gateOpen);
  const [symbolCount, setSymbolCount] = useState(0);

  // Load admin-controlled pricing overrides once.
  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, paths.pricingDoc));
        if (!cancelled && snap.exists()) setPricing(sanitizePricing(snap.data()));
      } catch {
        // Default pricing applies; nothing to do.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPricing]);

  // Anonymous visitors are metered by the server; surface the Gate once the
  // local mirror reports exhaustion (kept for instant feedback, not control).
  useEffect(() => {
    if (state === "anonymous") {
      void fetch("/api/ai", { method: "GET" }).catch(() => undefined);
    }
  }, [state]);

  return (
    <>
      {children}
      <MembershipBanner />
      <GoldenSymbols
        solvedCount={symbolCount}
        onSolve={() => setSymbolCount((c) => c + 1)}
      />
      <GateModal open={gateOpen} />
      {uid && auth && <span className="sr-only">مسجّل الدخول.</span>}
    </>
  );
}