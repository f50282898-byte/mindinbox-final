"use client";

/**
 * Session bridge: Firebase auth -> app store.
 *
 * Authorisation for privileged surfaces is decided server-side in
 * `/api/admin/*` by verifying the ID token signature. The `isAdmin` flag in
 * this store exists purely to decide whether to *render* the console UI; it is
 * never the thing that grants access.
 */

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db, paths } from "@/lib/firebase";
import { useAppStore, type EntryKind } from "@/lib/store";
import type { Tier } from "@/lib/tiers";
import { readLocalUser } from "@/lib/auth/client";

export type AuthState = "loading" | "anonymous" | "member" | "unavailable";

export function useSession(): { state: AuthState; uid: string | null } {
  const setIdentity = useAppStore((s) => s.setIdentity);
  const setAuthResolved = useAppStore((s) => s.setAuthResolved);
  const setMembership = useAppStore((s) => s.setMembership);
  const setEntries = useAppStore((s) => s.setEntries);
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let generation = 0;
    let disposed = false;
    const apply = async (user: User | null) => {
      const revision = ++generation;
      const local = user ? null : readLocalUser();
      setIdentity({ uid: user?.uid ?? local?.uid ?? null, email: user?.email ?? null,
        displayName: user?.displayName ?? local?.displayName ?? null, isAdmin: false });
      setMembership("free", null);
      setState(user ? "member" : "anonymous");
      setAuthResolved(true);
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/auth/entitlements", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (disposed || revision !== generation || auth?.currentUser?.uid !== user.uid) return;
        const tier: Tier = data.tier === "oracle" || data.tier === "sanctum" ? data.tier : "free";
        setMembership(tier, null);
        setIdentity({ uid: user.uid, email: user.email, displayName: user.displayName,
          isAdmin: data.source === "admin" });
      } catch { /* Unavailable entitlements never preserve privileged UI. */ }
    };
    const refresh = () => { void apply(auth?.currentUser ?? null); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const unsub = auth ? onAuthStateChanged(auth, (user) => { void apply(user); }) : undefined;
    if (!auth) refresh();
    window.addEventListener("miab-auth-change", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      generation++;
      unsub?.();
      window.removeEventListener("miab-auth-change", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [setIdentity, setAuthResolved, setMembership, setEntries]);

  const uid = useAppStore((s) => s.uid);
  return { state, uid };
}

/**
 * Live tracker stream. Firestore's offline cache keeps this populated when
 * the connection drops; writes are queued and synced on reconnect.
 */
export function useTrackerEntries(enabled: boolean) {
  const uid = useAppStore((s) => s.uid);
  const setEntries = useAppStore((s) => s.setEntries);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!uid || !db) {
      // Guest / offline: keep whatever is in the local mirror; do not clear it.
      return;
    }

    setSyncing(true);
    const entriesQuery = query(
      collection(db, paths.userEntries(uid)),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    return onSnapshot(
      entriesQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => {
          const data = d.data() as { kind?: EntryKind; text?: string; createdAt?: unknown };
          const raw = data.createdAt;
          const createdAt =
            raw && typeof raw === "object" && "toMillis" in (raw as { toMillis?: unknown })
              ? (raw as { toMillis(): number }).toMillis()
              : Number(raw) || 0;
          return { id: d.id, kind: data.kind ?? "thought", text: data.text ?? "", createdAt };
        });
        setEntries(rows.filter((r) => r.createdAt > 0));
        setError(null);
        setSyncing(false);
      },
      () => {
        setError("تعذّر الوصول إلى السجل المحلي بعد. تحقّق من الاتصال ثم أعد المحاولة.");
        setSyncing(false);
      }
    );
  }, [enabled, uid, setEntries]);

  return { error, syncing };
}

/** Appends a tracker entry to the local mirror first, then to Firestore (queued offline). */
export async function writeEntry(kind: EntryKind, text: string): Promise<boolean> {
  const { uid } = useAppStore.getState();
  const trimmed = text.trim();
  if (!trimmed) return false;

  const addEntry = useAppStore.getState().addEntry;
  // Always write to the local mirror first so the UI updates instantly —
  // even for guests or offline sessions without Firebase.
  addEntry({ id: crypto.randomUUID(), kind, text: trimmed, createdAt: Date.now() });

  if (!uid || !db) {
    // Guest / offline: persisted locally only; synced when Firebase configures.
    return false;
  }

  try {
    await setDoc(
      doc(collection(db, paths.userEntries(uid))),
      { kind, text: trimmed, createdAt: serverTimestamp() },
      { merge: false }
    );
    return true;
  } catch {
    // Offline: the local entry is already saved; Firestore queues the write on reconnect.
    return false;
  }
}

/** Heartbeat analytics — monotonic durationSeconds satisfies firestore.rules. */
export function useSessionTelemetry(enabled: boolean) {
  const uid = useAppStore((s) => s.uid);

  useEffect(() => {
    if (!enabled || !uid || !db) return;
    let stop: (() => void) | undefined;

    const unsub = onAuthStateChanged(auth!, (user) => {
      stop?.();
      stop = undefined;
      if (!user || !db) return;

      const startedAt = Date.now();
      const ref = doc(collection(db, paths.analyticsSessions));
      const persist = () =>
        setDoc(
          ref,
          {
            uid: user.uid,
            createdAt: new Date(startedAt),
            durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
          },
          { merge: true }
        ).catch(() => undefined);

      void persist();
      const beat = window.setInterval(() => void persist(), 60_000);
      const onHide = () => {
        if (document.visibilityState === "hidden") void persist();
      };
      document.addEventListener("visibilitychange", onHide);

      stop = () => {
        window.clearInterval(beat);
        document.removeEventListener("visibilitychange", onHide);
        void persist();
      };
    });

    return () => {
      unsub();
      stop?.();
    };
  }, [enabled, uid]);
}