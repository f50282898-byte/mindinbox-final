import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: { currentUser: null as any }, login: vi.fn(), signup: vi.fn(), link: vi.fn(), profile: vi.fn(), identity: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ auth: mock.auth }));
vi.mock("@/lib/store", () => ({ useAppStore: { getState: () => ({ setIdentity: mock.identity }) } }));
vi.mock("firebase/auth", async (original) => ({
  ...await original<typeof import("firebase/auth")>(),
  setPersistence: vi.fn(async () => undefined),
  signInWithEmailAndPassword: mock.login,
  createUserWithEmailAndPassword: mock.signup,
  linkWithCredential: mock.link,
  updateProfile: mock.profile,
  sendEmailVerification: vi.fn(async () => undefined),
}));
import { signInWithEmail, signUp, readLocalUser } from "./client";
beforeEach(() => { vi.clearAllMocks(); mock.auth.currentUser = null; mock.profile.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllGlobals());
describe("authenticated operations never fabricate local accounts", () => {
 it.each(["auth/network-request-failed", "auth/operation-not-allowed", "auth/wrong-password"])("rejects %s", async (code) => {
  mock.login.mockRejectedValue({ code });
  await expect(signInWithEmail("reader@example.com", "a-long-password")).rejects.toThrow();
  expect(mock.identity).not.toHaveBeenCalled();
 });
 it("uses modular profile updates on a new account", async () => {
  const user = { uid: "new", email: "reader@example.com", isAnonymous: false };
  mock.signup.mockResolvedValue({ user });
  await signUp({ email: "reader@example.com", password: "a-long-password", displayName: "Reader" });
  expect(mock.profile).toHaveBeenCalledWith(user, { displayName: "Reader" });
 });
 it("links anonymous accounts without creating another uid", async () => {
  const user = { uid: "guest", email: "reader@example.com", isAnonymous: true };
  mock.auth.currentUser = user; mock.link.mockResolvedValue({ user });
  const result = await signUp({ email: "reader@example.com", password: "a-long-password", displayName: "Reader" });
  expect(result.uid).toBe("guest"); expect(mock.signup).not.toHaveBeenCalled();
  expect(mock.profile).toHaveBeenCalledWith(user, { displayName: "Reader" });
 });
 it("does not restore a local record as an authenticated account", () => {
  vi.stubGlobal("window", { localStorage: { getItem: () => JSON.stringify({ uid: "local-forged", isAnonymous: false, emailVerified: true }) } });
  expect(readLocalUser()).toBeNull();
 });
});
