"use client";

import { useEffect, useState, type ReactNode } from "react";
import { auth, db, paths } from "@/lib/firebase";
import { useSession, useSessionTelemetry } from "@/lib/session";
import { useAppStore } from "@/lib/store";
import { sanitizePricing } from "@/lib/tiers";
import { doc, getDoc } from "firebase/firestore";
import { MembershipBanner } from "@/components/MembershipBanner";
import { GoldenSymbols } from "@/components/GoldenSymbols";

/**
 * Client shell.
 *
 * Owns the cross-cutting concerns that every page needs exactly once:
 * auth resolution, telemetry, pricing config, the membership banner, and the
 * hidden-symbol puzzle layer.
 *
 * The Gate itself is NOT here. It used to be, as a global `GateModal` driven by
 * the store, and that was wrong: the gate is a decision about one question, so it
 * belongs to the surface that raised it. Rendered globally it appeared on any
 * page that happened to observe exhaustion, and a page could therefore show two
 * gate dialogs at once. `/wisdom` renders `GateDialog` next to its composer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, uid } = useSession();
  useSessionTelemetry(state === "member");

  const setPricing = useAppStore((s) => s.setPricing);
  const [symbolCount, setSymbolCount] = useState(0);

  // Signal that the client tree has hydrated.
  //
  // E2E tests drive the app by clicking and by keyboard shortcut. Before
  // hydration React has attached no listeners, so an early click is a silent
  // no-op and the test fails for a reason that has nothing to do with the app.
  // Marking hydration lets tests wait for the app to actually be interactive.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);

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
      {uid && auth && <span className="sr-only">مسجّل الدخول.</span>}
    </>
  );
}