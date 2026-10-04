import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  FIREBASE_DEPENDENT_ROUTES,
  isFirebaseConfigured,
  missingFirebaseKeys,
} from "./routes";

/**
 * The route list is read at build time by `sitemap.ts` and, independently, by three page
 * `metadata` exports. If it drifts, the sitemap advertises a page that renders
 * "unavailable", which is the one outcome both files exist to prevent.
 */

const KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
] as const;

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.clear();
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("firebase route list", () => {
  it("names exactly the three surfaces that need an account", () => {
    expect([...FIREBASE_DEPENDENT_ROUTES].sort()).toEqual(["/enter", "/journal", "/tracker"]);
  });

  it("does not include the routes that work with no Firebase at all", () => {
    const dependent = FIREBASE_DEPENDENT_ROUTES as readonly string[];
    // These must stay indexable in an unconfigured build, or a documentation-only
    // deploy would have an empty sitemap.
    for (const route of ["/", "/wisdom", "/quotes", "/pricing", "/privacy"]) {
      expect(dependent).not.toContain(route);
    }
  });
});

describe("isFirebaseConfigured", () => {
  it("is false when nothing is set", () => {
    expect(isFirebaseConfigured()).toBe(false);
    expect(missingFirebaseKeys().length).toBeGreaterThan(0);
  });

  it("is false when the three identifying keys are present but one is blank", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "key";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proj";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "";
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("treats a whitespace-only key as missing", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "   ";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proj";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1:web:abc";
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("is true with only the three identifying keys", () => {
    // Deliberately no authDomain, bucket, sender or measurement id: sign-in and
    // Firestore work without them, and a project that declined Analytics must still be
    // able to authenticate people.
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "key";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proj";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1:web:abc";
    expect(isFirebaseConfigured()).toBe(true);
    expect(missingFirebaseKeys()).toEqual([]);
  });
});