"use client";

/**
 * Firebase Client SDK bootstrap — lazy singleton, client-only.
 *
 * Constraints:
 * - Client SDK only. No firebase-admin (Node built-ins).
 * - Firestore runs with `persistentLocalCache` + `persistentMultipleTabManager`
 *   (current API, not the deprecated `enableIndexedDbPersistence`).
 * - Analytics only initializes after user consent via `isSupported()`.
 * - Every export is null-safe: when Firebase env vars are absent the app
 *   degrades to an anonymous, read-only experience instead of crashing.
 */

import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
} from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  getAnalytics,
  isSupported,
  type Analytics,
} from "firebase/analytics";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { firebaseProjectIdOrEmpty, isFirebaseConfigured } from "@/lib/firebase/config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;
let analyticsInitialized = false;

/** Returns true only when all required Firebase public config is present. */
export function firebaseConfigured(): boolean {
  return isFirebaseConfigured();
}

/** Initializes Firebase app (idempotent). */
function initApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  // Read directly rather than via `env()`: `env()` throws when a Firebase key is
  // absent, which is correct for a secret and wrong here — a build with no Firebase
  // configuration is a legitimate state that must render, not crash. `config.ts` is
  // the single source of truth for that question.
  const e = process.env;
  const config = {
    apiKey: e.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: e.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: e.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: e.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: e.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: e.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    measurementId: e.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
  };
  app = getApps().length > 0 ? getApp() : initializeApp(config);
  return app;
}

/** Initializes Auth (idempotent). */
export function getAuthClient(): Auth | null {
  const a = initApp();
  if (!a) return null;
  if (auth) return auth;
  auth = getAuth(a);
  // Persist auth state across sessions (IndexedDB)
  void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  return auth;
}

/** Initializes Firestore with offline persistence (current API). */
export function getFirestoreClient(): Firestore | null {
  const a = initApp();
  if (!a) return null;
  if (db) return db;
  if (typeof window === "undefined") {
    // Server/edge: no persistence
    db = getFirestore(a);
  } else {
    try {
      db = initializeFirestore(a, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      // Already initialized; fall back
      db = getFirestore(a);
    }
  }
  return db;
}

/** Initializes Storage. */
export function getStorageClient(): FirebaseStorage | null {
  const a = initApp();
  if (!a) return null;
  if (storage) return storage;
  storage = getStorage(a);
  return storage;
}

/** Initializes Analytics (only after user consent + isSupported). */
export async function getAnalyticsClient(): Promise<Analytics | null> {
  const a = initApp();
  if (!a || analyticsInitialized) return analytics;
  analyticsInitialized = true;
  try {
    const supported = await isSupported();
    if (supported) {
      analytics = getAnalytics(a);
    }
  } catch {
    // Not supported or already initialized
  }
  return analytics;
}

/** Mirrors the project id the edge routes verify ID tokens against. */
export const firebaseProjectId = firebaseProjectIdOrEmpty();

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

/** Initialize everything (call once from AppShell). */
export function initFirebase(): void {
  initApp();
  getAuthClient();
  getFirestoreClient();
  getStorageClient();
}