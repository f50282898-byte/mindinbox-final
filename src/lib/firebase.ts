"use client";

/**
 * Firebase Client SDK bootstrap — the only database/auth layer in this app.
 *
 * Constraints:
 *  - Client SDK only. No firebase-admin (it depends on Node `net`/`crypto`).
 *  - Firestore runs with `persistentLocalCache` + `persistentMultipleTabManager`
 *    so reads and writes keep working offline (required for the tracker).
 *  - Every export is null-safe: when Firebase env vars are absent the app
 *    degrades to an anonymous, read-only experience instead of crashing.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  firebaseProjectIdOrEmpty,
  isFirebaseConfigured,
  type FirebaseEnvKey,
} from "@/lib/firebase/config";

export type { FirebaseEnvKey };

/**
 * Read from `process.env` directly, never through `env()`.
 *
 * `env()` throws when a Firebase key is absent. That is the right behaviour for a
 * secret and the wrong behaviour here: a build with no Firebase configuration is a
 * legitimate state, and this module's entire job is to represent it without throwing.
 */
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDGgTDrDJsRvulhzK1p59AbuhJwQYSUufI",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "mindinbox-50d84.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mindinbox-50d84",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "mindinbox-50d84.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1087016266441",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:1087016266441:web:da1b3f31fad97e44ee3b18",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-SVSYPPTCX2",
};

/**
 * Whether sign-in and Firestore can work.
 *
 * Re-exported from `firebase/config` rather than recomputed, because two components
 * asking this question must not be able to get two different answers. The local const
 * above still holds the same values; `isFirebaseConfigured()` is what decides.
 */
export const firebaseConfigured = isFirebaseConfigured();

/** Mirrors the project id the server routes verify ID tokens against. */
export const firebaseProjectId = firebaseProjectIdOrEmpty();

let app: FirebaseApp | null = null;
if (firebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  // Initialize Analytics safely — browser only, never on Edge/SSR.
  if (typeof window !== "undefined") {
    void isSupported()
      .then((yes) => {
        if (yes && app) getAnalytics(app);
      })
      .catch(() => undefined);
  }
}

export const auth: Auth | null = app ? getAuth(app) : null;
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;

function initFirestore(firebaseApp: FirebaseApp): Firestore {
  // `initializeFirestore` throws if Firestore already started; fall back.
  if (typeof window === "undefined") return getFirestore(firebaseApp);
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export const db: Firestore | null = app ? initFirestore(app) : null;

if (typeof window !== "undefined" && auth) {
  void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
}

/** Firestore collection / document paths, centralised so rules stay in sync. */
export const paths = {
  user: (uid: string) => `users/${uid}` as const,
  userEntries: (uid: string) => `users/${uid}/entries` as const,
  userConversations: (uid: string) => `users/${uid}/conversations` as const,
  userDays: (uid: string) => `users/${uid}/days` as const,
  userHabits: (uid: string) => `users/${uid}/habits` as const,
  userPrinciples: (uid: string) => `users/${uid}/principles/main` as const,
  userNotes: (uid: string) => `users/${uid}/notes` as const,
  userSettings: (uid: string) => `users/${uid}/settings/main` as const,
  userEvents: (uid: string) => `users/${uid}/events` as const,
  userPuzzles: (uid: string) => `users/${uid}/puzzles` as const,
  siteConfig: "siteConfig",
  libraryDoc: "siteConfig/library",
  adsDoc: "siteConfig/ads",
  pricingDoc: "siteConfig/pricing",
  analyticsEvents: "analyticsEvents",
  analyticsSessions: "analyticsSessions",
  communityPosts: "communityPosts",
  /** Premium PDFs live here to match storage.rules. */
  premiumLibrary: "premium-library",
} as const;
