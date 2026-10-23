"use client";

/**
 * Session bridge: Firebase auth -> app store.
 *
 * Authorisation for privileged surfaces is decided server-side in
 * `/api/admin/*` by verifying the ID token signature. The `isAdmin` flag in
 * this store exists purely to decide whether to *render* the console UI; it is
 * never the thing that grants access.
 */

import { getRedirectResult, onAuthStateChanged, type User } from "firebase/auth";
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
import { readLocalUser, syncAuthSuccess } from "@/lib/auth/client";

export type AuthState = "loading" | "anonymous" | "member" | "unavailable";

/** Asks the server route whether this token really carries `admin: true`. */
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
  const [state, setState] = useState<AuthState>("loading");
  const seenUid = useRef<string | null>(null);

  useEffect(() => {
    const applyLocal = (): boolean => {
      const local = readLocalUser();
      if (local) {
        seenUid.current = local.uid;
        setIdentity({
          uid: local.uid,
          email: local.email,
          displayName: local.displayName,
          isAdmin: false,
        });
        setState("member");
        setAuthResolved(true);
        return true;
      }
      return false;
    };

    const handleAuthChange = (e?: Event) => {
      const custom = e as CustomEvent<{ uid: string; email: string | null; displayName: string | null } | null> | undefined;
      const record = custom?.detail !== undefined ? custom.detail : readLocalUser();
      if (record) {
        seenUid.current = record.uid;
        setIdentity({
          uid: record.uid,
          email: record.email,
          displayName: record.displayName,
          isAdmin: false,
        });
        setState("member");
        setAuthResolved(true);
      } else {
        seenUid.current = null;
        setIdentity({ uid: null, isAdmin: false });
        setState("anonymous");
        setAuthResolved(true);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("miab-auth-change", handleAuthChange);
      window.addEventListener("storage", handleAuthChange);
    }

    const hasLocal = applyLocal();

    if (!auth) {
      if (!hasLocal) {
        setState("anonymous");
      }
      setAuthResolved(true);
      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener("miab-auth-change", handleAuthChange);
          window.removeEventListener("storage", handleAuthChange);
        }
      };
    }

    // Process redirect result from mobile Google OAuth flow
    void getRedirectResult(auth)
      .then((cred) => {
        if (cred && cred.user) {
          syncAuthSuccess(cred.user);
        }
      })
      .catch(() => undefined);

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (applyLocal()) {
          return;
        }
        seenUid.current = null;
        setIdentity({ uid: null, isAdmin: false });
        setMembership("free", null);
        setEntries([]);
        setState("anonymous");
        setAuthResolved(true);
        return;
      }

      // Sync Firebase user to local storage and store
      syncAuthSuccess(user);

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
      setAuthResolved(true);

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

    return () => {
      unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("miab-auth-change", handleAuthChange);
        window.removeEventListener("storage", handleAuthChange);
      }
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