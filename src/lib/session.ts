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
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { auth, db, paths } from "@/lib/firebase";
import { useAppStore, type EntryKind } from "@/lib/store";
import type { Tier } from "@/lib/tiers";

export type AuthState = "loading" | "anonymous" | "member" | "unavailable";

/** Asks the edge route whether this token really carries `admin: true`. */
async function checkAdminClaim(user: User): Promise<boolean> {
  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { isAdmin?: boolean };
    return data.isAdmin === true;
  } catch {
    return false;
  }
}

export function useSession(): { state: AuthState; uid: string | null } {
  const setIdentity = useAppStore((s) => s.setIdentity);
  const setAuthResolved = useAppStore((s) => s.setAuthResolved);
  const setMembership = useAppStore((s) => s.setMembership);
  const setEntries = useAppStore((s) => s.setEntries);
  const [state, setState] = useState<AuthState>(auth ? "loading" : "unavailable");
  const seenUid = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setAuthResolved(true);
      setState("unavailable");
      return;
    }

    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        seenUid.current = null;
        setIdentity({ uid: null, isAdmin: false });
        setMembership("free", null);
        setEntries([]);
        setState("anonymous");
        return;
      }

      // Returning user: react to re-auth without re-running the full profile load.
      if (seenUid.current === user.uid) return;
      seenUid.current = user.uid;

      setIdentity({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        isAdmin: false,
      });
      setState("member");

      if (!db) return;

      try {
        const [isAdmin, profileSnap] = await Promise.all([
          checkAdminClaim(user),
          getDoc(doc(db, paths.user(user.uid))),
        ]);

        if (isAdmin) setIdentity({ uid: user.uid, isAdmin: true });

        const profile = profileSnap.data();
        const tier = (profile?.subscriptionTier as Tier | undefined) ?? "free";
        setMembership(tier, (profile?.trialEnd as string | undefined) ?? null);
      } catch {
        // Offline or rules-denied: fall back to free tier, keep the session.
      }
    });
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
    if (!enabled || !uid || !db) {
      setEntries([]);
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

/** Appends a tracker entry to Firestore (queued offline) and to the mirror. */
export async function writeEntry(kind: EntryKind, text: string): Promise<boolean> {
  const { uid } = useAppStore.getState();
  const trimmed = text.trim();
  if (!uid || !db || !trimmed) return false;

  const addEntry = useAppStore.getState().addEntry;
  try {
    await setDoc(
      doc(collection(db, paths.userEntries(uid))),
      { kind, text: trimmed, createdAt: serverTimestamp() },
      { merge: false }
    );
    addEntry({ id: crypto.randomUUID(), kind, text: trimmed, createdAt: Date.now() });
    return true;
  } catch {
    // Offline: keep it locally; Firestore will sync when the client reconnects
    // only if the write was queued. Surface failure rather than pretend.
    addEntry({ id: crypto.randomUUID(), kind, text: trimmed, createdAt: Date.now() });
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
      const persist = (ended: boolean) =>
        setDoc(
          ref,
          {
            uid: user.uid,
            startedAt: new Date(startedAt).toISOString(),
            durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
            updatedAt: serverTimestamp(),
            ...(ended ? { endedAt: serverTimestamp() } : {}),
          },
          { merge: true }
        ).catch(() => undefined);

      void persist(false);
      const beat = window.setInterval(() => void persist(false), 60_000);
      const onHide = () => {
        if (document.visibilityState === "hidden") void persist(false);
      };
      document.addEventListener("visibilitychange", onHide);

      stop = () => {
        window.clearInterval(beat);
        document.removeEventListener("visibilitychange", onHide);
        void persist(true);
      };
    });

    return () => {
      unsub();
      stop?.();
    };
  }, [enabled, uid]);
}