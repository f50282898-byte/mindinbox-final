"use client";

import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect } from "react";
import { auth, db } from "@/lib/firebase";

export function SessionTelemetry() {
  useEffect(() => {
    if (!auth || !db) return;
    let stopSession: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      stopSession?.();
      stopSession = undefined;
      if (!user || !db) return;

      const startedAt = Date.now();
      const sessionRef = doc(collection(db, "analyticsSessions"));
      const persistSession = (ended: boolean) => setDoc(sessionRef, {
        uid: user.uid,
        startedAt: new Date(startedAt).toISOString(),
        durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
        updatedAt: serverTimestamp(),
        ...(ended ? { endedAt: serverTimestamp() } : {}),
      }, { merge: true }).catch(() => undefined);

      void persistSession(false);
      const heartbeat = window.setInterval(() => { void persistSession(false); }, 60_000);
      const updateWhenHidden = () => {
        if (document.visibilityState === "hidden") void persistSession(false);
      };
      document.addEventListener("visibilitychange", updateWhenHidden);
      stopSession = () => {
        window.clearInterval(heartbeat);
        document.removeEventListener("visibilitychange", updateWhenHidden);
        void persistSession(true);
      };
    });

    return () => {
      unsubscribe();
      stopSession?.();
    };
  }, []);

  return null;
}
