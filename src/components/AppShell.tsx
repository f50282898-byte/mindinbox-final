"use client";

import dynamic from "next/dynamic";
import { useEffect, type ReactNode } from "react";
import { auth, db, paths } from "@/lib/firebase";
import { useSession, useSessionTelemetry } from "@/lib/session";
import { useAppStore } from "@/lib/store";
import { sanitizePricing } from "@/lib/tiers";
import { doc, getDoc } from "firebase/firestore";

/**
 * The membership banner is conditional and pulls in `framer-motion`.
 * Loaded eagerly it costs every reader on every route, so it stays client-only.
 */
const MembershipBanner = dynamic(
  () => import("@/components/MembershipBanner").then((m) => m.MembershipBanner),
  { ssr: false }
);

/**
 * Client shell.
 *
 * Owns the cross-cutting concerns that every page needs exactly once:
 * auth resolution, telemetry, pricing config, and the membership banner.
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
    if (state !== "anonymous") return;
    const controller = new AbortController();
    // The body must be consumed or cancelled.
    //
    // This request used to be `void fetch("/api/ai").catch(() => undefined)`, which
    // left the response body unread. An unread body keeps the loader alive: the
    // browser holds the connection open indefinitely, one per anonymous page view, and
    // never reuses it. Playwright made it visible — `requestfinished` never fired for
    // this URL and the page never reached `networkidle` 25 seconds later — but the cost
    // is the reader's connection slot either way.
    //
    // The call exists only to make the server set the signed `miab-anon` cookie, so
    // discarding the payload is correct; discarding it *without releasing the stream* is
    // what was wrong.
    void fetch("/api/ai", { method: "GET", signal: controller.signal })
      .then((res) => res.body?.cancel())
      .catch(() => undefined);
    return () => controller.abort();
  }, [state]);

  return (
    <>
      {children}
      <MembershipBanner />
      {uid && auth && <span className="sr-only">مسجّل الدخول.</span>}
    </>
  );
}