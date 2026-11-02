import { afterAll, beforeAll, describe, it } from "vitest";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { readFileSync } from "node:fs";

describe.skipIf(!process.env.FIREBASE_STORAGE_EMULATOR_HOST)("private media access", () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: "mind-in-a-box-rules-test", storage: { rules: readFileSync("storage.rules","utf8") } });
  });
  afterAll(async () => { await env?.cleanup(); });

  it("permits owner media, refuses another reader and rejects executable uploads", async () => {
    const alice = env.authenticatedContext("alice").storage();
    const bob = env.authenticatedContext("bob").storage();
    const file = "users/alice/portrait.webp";
    const sample = new Uint8Array([1,2,3]);
    await assertSucceeds(uploadBytes(ref(alice,file),sample,{ contentType:"image/webp" }));
    await assertFails(getBytes(ref(bob,file)));
    await assertFails(uploadBytes(ref(bob,file),sample,{ contentType:"image/webp" }));
    await assertFails(uploadBytes(ref(alice,"users/alice/test.html"),sample,{ contentType:"text/html" }));
    await assertFails(uploadBytes(ref(alice,"premium-library/test.pdf"),sample,{ contentType:"application/pdf" }));
  });
});
