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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

/** Mirrors the project id the edge routes verify ID tokens against. */
export const firebaseProjectId = firebaseConfig.projectId;

let app: FirebaseApp | null = null;
if (firebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
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