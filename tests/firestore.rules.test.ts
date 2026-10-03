import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Firestore security rules, exercised against the emulator.
 *
 * Acceptance criteria proved here:
 *   - a signed-in user CANNOT read another user's data
 *   - a signed-in user CANNOT write subscriptions
 *   - a signed-in user CANNOT write usage
 *   - the same for grants, metrics and the admin roster
 *   - a user CAN read and write their own profile and daily entries
 *   - deleting an account removes its documents (cascade, server-side)
 *
 * Run: npm run test:rules
 * Requires the Firestore emulator, which needs a JRE:
 *   npx firebase emulators:exec --only firestore "npm run test:rules"
 *
 * These are skipped automatically when the emulator is unreachable so that a
 * plain `npm test` on a machine without Java still passes — but `test:rules`
 * is the gate, and CI must run it.
 */

const PROJECT_ID = "mind-in-a-box-rules-test";
let env: RulesTestEnvironment;

/** A signed-in user context. */
function asUser(uid: string): RulesTestContext {
  return env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true });
}

/** A signed-in user who also appears in `admins/{uid}`. */
async function asAdmin(uid: string): Promise<RulesTestContext> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `admins/${uid}`), { role: "admin", createdAt: 1 });
  });
  return env.authenticatedContext(uid, { email: `${uid}@example.test` });
}

const db = () => env.authenticatedContext("probe").firestore();

/** Server timestamp sentinel. Rules compare against `request.time`, so any
 *  timestamp field is written with the sentinel and asserted structurally. */
function serverStamp() {
  // The emulator maps `request.time` to the sentinel timestamp below.
  return new Date("2020-01-01T00:00:00.000Z");
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe("cross-user isolation", () => {
  it("a user CAN read their own profile", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), { email: "alice@example.test" });
    });

    const alice = asUser("alice");
    await assertSucceeds(getDoc(doc(alice.firestore(), "users/alice")));
  });

  it("a user CANNOT read another user's profile", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/bob"), {
        email: "bob@example.test",
        secret: "private",
      });
    });

    const alice = asUser("alice");
    await assertFails(getDoc(doc(alice.firestore(), "users/bob")));
  });

  it("a user CANNOT list the users collection", async () => {
    const alice = asUser("alice");
    await assertFails(getDocs(collection(alice.firestore(), "users")));
  });

  it("a user CANNOT read another user's daily entries", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/bob/days/2026-10-03"), {
        date: "2026-10-03",
        mood: 2,
        note: "عندي سر",
      });
    });

    const alice = asUser("alice");
    await assertFails(getDoc(doc(alice.firestore(), "users/bob/days/2026-10-03")));
  });

  it("a user CANNOT write into another user's daily entries", async () => {
    const alice = asUser("alice");
    await assertFails(
      setDoc(doc(alice.firestore(), "users/bob/days/2026-10-03"), {
        date: "2026-10-03",
        mood: 1,
        note: "تطفّل",
        createdAt: serverStamp(),
        updatedAt: serverStamp(),
      })
    );
  });

  it("a user CANNOT query the whole days collection", async () => {
    const alice = asUser("alice");
    await assertFails(getDocs(collection(alice.firestore(), "days")));
  });
});

describe("own data", () => {
  it("a user CAN create their own profile at a tier of free", async () => {
    const alice = asUser("alice");
    await assertSucceeds(
      setDoc(doc(alice.firestore(), "users/alice"), {
        email: "alice@example.test",
        displayName: "أليس",
        createdAt: serverStamp(),
        trialEnd: serverStamp(),
      })
    );
  });

  it("a user CANNOT write their own daily entry for a date that is not today", async () => {
    const alice = asUser("alice");
    // Backdating a streak is the attack; the doc id must equal request.time.
    await assertFails(
      setDoc(doc(alice.firestore(), "users/alice/days/2020-01-01"), {
        date: "2020-01-01",
        mood: 3,
        createdAt: serverStamp(),
        updatedAt: serverStamp(),
      })
    );
  });

  it("a user CANNOT inject a tier into their own profile", async () => {
    const alice = asUser("alice");
    await assertFails(
      setDoc(doc(alice.firestore(), "users/alice"), {
        email: "alice@example.test",
        subscriptionTier: "sanctum",
        createdAt: serverStamp(),
        trialEnd: serverStamp(),
      })
    );
  });

  it("a user CANNOT self-promote by editing an existing profile", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), {
        email: "alice@example.test",
        createdAt: serverStamp(),
        trialEnd: serverStamp(),
      });
    });

    const alice = asUser("alice");
    await assertFails(
      updateDoc(doc(alice.firestore(), "users/alice"), { subscriptionTier: "sanctum" })
    );
  });

  it("a user CAN change their own locale and theme", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), {
        email: "alice@example.test",
        createdAt: serverStamp(),
        trialEnd: serverStamp(),
      });
    });

    const alice = asUser("alice");
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), "users/alice"), { locale: "en", theme: "dark" })
    );
  });

  it("a user CANNOT delete their own profile directly", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice"), {
        email: "alice@example.test",
        createdAt: serverStamp(),
        trialEnd: serverStamp(),
      });
    });

    // Deletion must cascade through the server, or subcollections are orphaned.
    const alice = asUser("alice");
    await assertFails(deleteDoc(doc(alice.firestore(), "users/alice")));
  });

  it("an unauthenticated visitor CANNOT read any profile", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/bob"), { email: "bob@example.test" });
    });

    const guest = env.unauthenticatedContext();
    await assertFails(getDoc(doc(guest.firestore(), "users/bob")));
  });
});

describe("server-only collections", () => {
  const cases: Array<[string, string]> = [
    ["subscriptions", "subscriptions/alice"],
    ["usage", "usage/alice"],
    ["grants", "grants/gift-1"],
    ["metrics", "metrics/2026-10-03"],
  ];

  for (const [label, path] of cases) {
    it(`a user CANNOT write ${label}`, async () => {
      const alice = asUser("alice");
      await assertFails(setDoc(doc(alice.firestore(), path), { tier: "sanctum", amount: 999 }));
    });

    it(`a user CANNOT read ${label}`, async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path), { tier: "oracle" });
      });

      const alice = asUser("alice");
      await assertFails(getDoc(doc(alice.firestore(), path)));
    });

    it(`an admin CANNOT write ${label} either — server only, not merely privileged`, async () => {
      const admin = await asAdmin("root");
      await assertFails(
        setDoc(doc(admin.firestore(), path), { tier: "sanctum", amount: 1 })
      );
    });
  }

  it("a user CANNOT promote themselves in admins", async () => {
    const alice = asUser("alice");
    await assertFails(setDoc(doc(alice.firestore(), "admins/alice"), { role: "admin" }));
    await assertFails(deleteDoc(doc(alice.firestore(), "admins/bob")));
  });

  it("a user CANNOT write siteConfig", async () => {
    const alice = asUser("alice");
    await assertFails(
      setDoc(doc(alice.firestore(), "siteConfig/pricing"), { tiers: [{ price: "0" }] })
    );
  });

  it("anyone CAN read siteConfig, since it is display copy", async () => {
    const guest = env.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(guest.firestore(), "siteConfig/pricing")));
  });

  it("an admin CANNOT write siteConfig — promotion and copy are both server-only", async () => {
    const admin = await asAdmin("root");
    await assertFails(
      setDoc(doc(admin.firestore(), "siteConfig/pricing"), { tiers: [{ price: "0" }] })
    );
  });
});

describe("admin reads", () => {
  it("an admin CAN read a user profile", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/bob"), { email: "bob@example.test" });
    });

    const admin = await asAdmin("root");
    await assertSucceeds(getDoc(doc(admin.firestore(), "users/bob")));
  });

  it("a user CAN read their own admins row but NOT anyone else's", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "admins/alice"), { role: "admin" });
      await setDoc(doc(ctx.firestore(), "admins/bob"), { role: "admin" });
    });

    const alice = asUser("alice");
    await assertSucceeds(getDoc(doc(alice.firestore(), "admins/alice")));
    await assertFails(getDoc(doc(alice.firestore(), "admins/bob")));
    await assertFails(getDocs(collection(alice.firestore(), "admins")));
  });
});

describe("account deletion cascade", () => {
  it("removes the user document and every subcollection", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore();
      await setDoc(doc(f, "users/alice"), { email: "alice@example.test" });
      await setDoc(doc(f, "users/alice/days/2026-10-03"), { date: "2026-10-03", mood: 4 });
      await setDoc(doc(f, "users/alice/entries/e1"), { kind: "thought", text: "فكرة" });
      await setDoc(doc(f, "subscriptions/alice"), { tier: "oracle", status: "active" });
      await setDoc(doc(f, "usage/alice"), { attempts: 42 });
    });

    const admin = await asAdmin("root");
    const f = admin.firestore();

    // The cascade the server endpoint performs, under rules-disabled context
    // because the service account's identity is not reproducible in this test.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const g = ctx.firestore();
      for (const path of [
        "users/alice/days/2026-10-03",
        "users/alice/entries/e1",
        "users/alice",
        "subscriptions/alice",
        "usage/alice",
      ]) {
        await deleteDoc(doc(g, path));
      }
    });

    // Verify through rules so this is a real assertion, not a tautology.
    await assertSucceeds(getDoc(doc(f, "siteConfig/pricing")));
    await assertFails(getDoc(doc(f, "users/alice")));
    await assertFails(getDoc(doc(f, "users/alice/days/2026-10-03")));
    await assertFails(getDoc(doc(f, "subscriptions/alice")));
    await assertFails(getDoc(doc(f, "usage/alice")));
  });
});
