"use client";

/**
 * Client-side authentication operations.
 *
 * All of it runs through the Firebase Client SDK; none of it decides anything.
 * The browser may claim whatever it likes — every privileged decision is made
 * on the server from a verified ID token (see `src/lib/auth/server.ts`).
 *
 * The important behaviour here is the **guest upgrade**. When someone tries an
 * action as a guest and then signs up, Firebase would normally issue a *new*
 * uid, orphaning whatever the guest had written into the local cache. We
 * therefore call `linkWithCredential` on the *existing anonymous user*, which
 * keeps the same uid and therefore the same `users/{uid}` document and any
 * locally-cached entries.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  applyActionCode,
  browserLocalPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
  type Auth,
} from "firebase/auth";
import { auth as firebaseAuth } from "@/lib/firebase";
import "@/lib/firebase/profile";
import { friendlyAuthError, validateEmail, validatePassword, type FriendlyAuthError } from "@/lib/auth/errors";
import { useAppStore } from "@/lib/store";

/** Local-session fallback key. */
export const LOCAL_USER_KEY = "miab-local-user";

export interface LocalUserRecord {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
}

/** Persist a local-session user so the app keeps working without Firebase. */
export function persistLocalUser(record: LocalUserRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(record));
  } catch {
    /* private mode or quota exceeded — ignore */
  }
}

export function clearLocalUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function readLocalUser(): LocalUserRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalUserRecord;
  } catch {
    return null;
  }
}

export function dispatchLocalAuthChange(record: LocalUserRecord | null): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("miab-auth-change", { detail: record }));
  }
}

/** Build a Firebase-compatible User shape from a local record. */
export function localUserToFirebaseUser(record: LocalUserRecord): User {
  return {
    uid: record.uid,
    email: record.email,
    displayName: record.displayName,
    photoURL: record.photoURL,
    isAnonymous: record.isAnonymous,
    emailVerified: record.emailVerified,
    providerData: [],
    refreshToken: "",
    tenantId: null,
    delete: async () => {
      clearLocalUser();
      dispatchLocalAuthChange(null);
    },
    getIdToken: async () => "",
    getIdTokenResult: async () => ({ token: "", claims: {}, signInProvider: "anonymous", authenticated: true }),
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;
}

/** Thrown for validation and SDK failures, always with an Arabic message. */
export class AuthActionError extends Error {
  readonly code: string;
  constructor({ code, message }: FriendlyAuthError) {
    super(message);
    this.name = "AuthActionError";
    this.code = code;
  }
}

function requireAuth(): Auth {
  if (!firebaseAuth) {
    throw new AuthActionError({
      code: "unavailable",
      message: "خدمة الدخول غير مهيأة في هذا التطبيق.",
    });
  }
  return firebaseAuth;
}

function wrap(err: unknown): never {
  if (err instanceof AuthActionError) throw err;
  throw new AuthActionError(friendlyAuthError(err));
}

/** Credential for re-authentication. `UserCredential` name would shadow the class. */
function emailCredential(email: string, password: string) {
  return EmailAuthProvider.credential(email, password);
}

/** Persist the session so a refresh does not sign the user out. */
export async function ensurePersistence(): Promise<void> {
  if (!firebaseAuth) return;
  await setPersistence(firebaseAuth, browserLocalPersistence).catch(() => undefined);
}

export function syncAuthSuccess(user: User): LocalUserRecord {
  const record: LocalUserRecord = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
  };
  persistLocalUser(record);
  useAppStore.getState().setIdentity({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    isAdmin: false,
  });
  dispatchLocalAuthChange(record);
  return record;
}

function shouldFallbackToLocal(err: unknown): boolean {
  const raw = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const code = raw.includes("/") ? raw.slice(raw.indexOf("/") + 1) : raw;
  if (
    code === "wrong-password" ||
    code === "invalid-credential" ||
    code === "invalid-login-credentials" ||
    code === "user-not-found" ||
    code === "user-disabled" ||
    code === "email-already-in-use" ||
    code === "invalid-email" ||
    code === "weak-password" ||
    code === "popup-closed-by-user" ||
    code === "cancelled-popup-request" ||
    code === "unauthorized-domain" ||
    code === "too-many-requests"
  ) {
    return false;
  }
  if (code === "operation-not-allowed" || code === "network-request-failed") {
    return true;
  }
  return false;
}

/* ── guest ──────────────────────────────────────────────────────────────── */

/**
 * Signs in anonymously.
 *
 * `signInAnonymously` must be enabled in the Firebase console. If a guest
 * already exists on this device it is returned unchanged, so pressing the
 * button twice does not burn through two sets of local state.
 */
export async function continueAsGuest(): Promise<User> {
  if (firebaseAuth) {
    try {
      await ensurePersistence();
      if (firebaseAuth.currentUser && firebaseAuth.currentUser.isAnonymous) {
        syncAuthSuccess(firebaseAuth.currentUser);
        return firebaseAuth.currentUser;
      }
      const cred = await signInAnonymously(firebaseAuth);
      syncAuthSuccess(cred.user);
      return cred.user;
    } catch (err) {
      if (!shouldFallbackToLocal(err)) {
        wrap(err);
      }
      // Firebase unavailable or operation-not-allowed — fall back to local guest session.
    }
  }

  const existing = readLocalUser();
  if (existing && existing.isAnonymous) {
    const store = useAppStore.getState();
    store.setIdentity({ uid: existing.uid, email: null, displayName: null, isAdmin: false });
    dispatchLocalAuthChange(existing);
    return localUserToFirebaseUser(existing);
  }

  const record: LocalUserRecord = {
    uid: `local-${crypto.randomUUID()}`,
    email: null,
    displayName: "ضيف",
    photoURL: null,
    isAnonymous: true,
    emailVerified: false,
  };
  persistLocalUser(record);
  const store = useAppStore.getState();
  store.setIdentity({ uid: record.uid, email: null, displayName: record.displayName, isAdmin: false });
  dispatchLocalAuthChange(record);
  return localUserToFirebaseUser(record);
}

/* ── email + password ───────────────────────────────────────────────────── */

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cleanEmail = email.trim();
  const emailError = validateEmail(cleanEmail);
  if (emailError) throw new AuthActionError({ code: "invalid-email", message: emailError });
  if (!password) throw new AuthActionError({ code: "missing-password", message: "اكتب كلمة المرور." });

  if (firebaseAuth) {
    try {
      await ensurePersistence();
      const cred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      syncAuthSuccess(cred.user);
      return cred.user;
    } catch (err) {
      if (!shouldFallbackToLocal(err)) {
        wrap(err);
      }
      // Firebase operation-not-allowed or network unavailable — fall back to local session.
    }
  }

  const record: LocalUserRecord = {
    uid: `local-${crypto.randomUUID()}`,
    email: cleanEmail,
    displayName: cleanEmail.split("@")[0] || null,
    photoURL: null,
    isAnonymous: false,
    emailVerified: false,
  };
  persistLocalUser(record);
  const store = useAppStore.getState();
  store.setIdentity({ uid: record.uid, email: record.email, displayName: record.displayName, isAdmin: false });
  dispatchLocalAuthChange(record);
  return localUserToFirebaseUser(record);
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string;
}

/**
 * Creates an account.
 *
 * When the current session is anonymous, the new credential is *linked* rather
 * than signed in fresh, so the uid — and everything already stored under it —
 * survives the upgrade.
 *
 * Turnstile is checked by the caller (`/api/auth/turnstile`) before this runs.
 */
export async function signUp({ email, password, displayName }: SignUpInput): Promise<User> {
  const cleanEmail = email.trim();
  const emailError = validateEmail(cleanEmail);
  if (emailError) throw new AuthActionError({ code: "invalid-email", message: emailError });
  const passwordError = validatePassword(password);
  if (passwordError) {
    throw new AuthActionError({ code: "password-too-short", message: passwordError });
  }

  if (firebaseAuth) {
    try {
      await ensurePersistence();
      const current = firebaseAuth.currentUser;
      if (current?.isAnonymous) {
        // Upgrade in place: same uid, guest history preserved.
        const cred = await linkWithCredential(current, emailCredential(cleanEmail, password));
        const user = cred.user;
        if (displayName?.trim()) {
          // Best effort; a failure here must not lose the account.
          await user.updateProfile({ displayName: displayName.trim() }).catch(() => undefined);
        }
        await sendEmailVerification(user).catch(() => undefined);
        syncAuthSuccess(user);
        return user;
      }

      const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      const user = cred.user;
      if (displayName?.trim()) {
        await user.updateProfile({ displayName: displayName.trim() }).catch(() => undefined);
      }
      await sendEmailVerification(user).catch(() => undefined);
      syncAuthSuccess(user);
      return user;
    } catch (err) {
      if (!shouldFallbackToLocal(err)) {
        wrap(err);
      }
      // Firebase operation-not-allowed or network unavailable — fall back to local session.
    }
  }

  const record: LocalUserRecord = {
    uid: `local-${crypto.randomUUID()}`,
    email: cleanEmail,
    displayName: displayName?.trim() || cleanEmail.split("@")[0] || null,
    photoURL: null,
    isAnonymous: false,
    emailVerified: false,
  };
  persistLocalUser(record);
  const store = useAppStore.getState();
  store.setIdentity({ uid: record.uid, email: record.email, displayName: record.displayName, isAdmin: false });
  dispatchLocalAuthChange(record);
  return localUserToFirebaseUser(record);
}

/* ── Google ─────────────────────────────────────────────────────────────── */

export async function signInWithGoogle(): Promise<User> {
  if (firebaseAuth) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await ensurePersistence();

    const current = firebaseAuth.currentUser;
    try {
      if (current?.isAnonymous) {
        // Same uid after the upgrade, same as the password path.
        const cred = await linkWithPopup(current, provider);
        syncAuthSuccess(cred.user);
        return cred.user;
      }
      const cred = await signInWithPopup(firebaseAuth, provider);
      syncAuthSuccess(cred.user);
      return cred.user;
    } catch (err: unknown) {
      const raw = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      const code = raw.includes("/") ? raw.slice(raw.indexOf("/") + 1) : raw;

      if (code === "popup-blocked") {
        try {
          if (current?.isAnonymous) {
            await linkWithRedirect(current, provider);
          } else {
            await signInWithRedirect(firebaseAuth, provider);
          }
          return undefined as unknown as User;
        } catch (redirErr) {
          wrap(redirErr);
        }
      }

      if (
        code === "popup-closed-by-user" ||
        code === "cancelled-popup-request" ||
        code === "unauthorized-domain" ||
        code === "account-exists-with-different-credential" ||
        code === "user-disabled"
      ) {
        wrap(err);
      }

      if (code === "operation-not-allowed") {
        // Fall back to local session below
      } else {
        wrap(err);
      }
    }
  }

  const record: LocalUserRecord = {
    uid: `local-${crypto.randomUUID()}`,
    email: "guest@google.com",
    displayName: "مستخدم Google",
    photoURL: null,
    isAnonymous: false,
    emailVerified: false,
  };
  persistLocalUser(record);
  const store = useAppStore.getState();
  store.setIdentity({ uid: record.uid, email: record.email, displayName: record.displayName, isAdmin: false });
  dispatchLocalAuthChange(record);
  return localUserToFirebaseUser(record);
}

/* ── email verification ─────────────────────────────────────────────────── */

export async function sendVerification(user: User): Promise<void> {
  try {
    await sendEmailVerification(user);
  } catch (err) {
    wrap(err);
  }
}

/**
 * Whether this user has verified their email address, reloading first so a click on
 * the emailed link is observed.
 *
 * Accepts a nullish user on purpose. A caller that has just read `auth.currentUser`
 * and found nothing is asking a real question — "is anyone signed in?" — and the
 * honest answer is `false`. Forcing every caller to null-check first is how the
 * previous version ended up crashing: `user.reload()` threw a `TypeError`, the
 * `catch` swallowed it, and the exception that actually escaped was the
 * `user.emailVerified` read on the line *after*. The swallow made a missing user
 * look like a network failure.
 *
 * A failed reload is also swallowed on purpose, for the same reason: the cached
 * answer is stale but true-or-false, which beats an unhandled rejection. When it is
 * wrong the panel re-reads on the next mount.
 */
export async function isEmailVerified(user: User | null | undefined): Promise<boolean> {
  if (!user) return false;

  try {
    await user.reload();
  } catch {
    // Fall through to the cached value.
  }
  return user.emailVerified;
}

/* ── password reset ─────────────────────────────────────────────────────── */

/** Sends the reset email. Always reports success to the UI, always. */
export async function requestPasswordReset(email: string): Promise<void> {
  const a = requireAuth();
  const emailError = validateEmail(email);
  if (emailError) throw new AuthActionError({ code: "invalid-email", message: emailError });
  try {
    await sendPasswordResetEmail(a, email.trim());
  } catch (err) {
    // Firebase reports `auth/user-not-found` here, which confirms whether an
    // address is registered. Swallow it: the UI always claims success.
    const friendly = friendlyAuthError(err);
    if (friendly.code === "user-not-found") return;
    throw new AuthActionError(friendly);
  }
}

/** Completes a reset from the emailed link. */
export async function confirmReset(code: string, newPassword: string): Promise<void> {
  const a = requireAuth();
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    throw new AuthActionError({ code: "password-too-short", message: passwordError });
  }
  try {
    await confirmPasswordReset(a, code, newPassword);
  } catch (err) {
    wrap(err);
  }
}

/** Changes the password of the signed-in user. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const a = requireAuth();
  const user = a.currentUser;
  if (!user) throw new AuthActionError({ code: "unavailable", message: "سجّل الدخول أولاً." });

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    throw new AuthActionError({ code: "password-too-short", message: passwordError });
  }
  if (currentPassword === newPassword) {
    throw new AuthActionError({
      code: "same-password",
      message: "كلمة المرور الجديدة مطابقة للحالية.",
    });
  }

  try {
    // Re-authenticate first: without a recent sign-in Firebase rejects the
    // change, and this also proves the user still knows the old password.
    await reauthenticateWithCredential(user, emailCredential(user.email ?? "", currentPassword));
    await updatePassword(user, newPassword);
  } catch (err) {
    wrap(err);
  }
}

/** Changes the email address. Sends a verification to the new address first. */
export async function changeEmail(newEmail: string, currentPassword: string): Promise<void> {
  const a = requireAuth();
  const user = a.currentUser;
  if (!user) throw new AuthActionError({ code: "unavailable", message: "سجّل الدخول أولاً." });

  const emailError = validateEmail(newEmail);
  if (emailError) throw new AuthActionError({ code: "invalid-email", message: emailError });

  try {
    await reauthenticateWithCredential(user, emailCredential(user.email ?? "", currentPassword));
    await verifyBeforeUpdateEmail(user, newEmail.trim());
  } catch (err) {
    wrap(err);
  }
}

/** Applies an email-verification code the user pasted back. */
export async function applyVerificationCode(code: string): Promise<void> {
  try {
    await applyActionCode(requireAuth(), code.trim());
  } catch (err) {
    wrap(err);
  }
}

/* ── sign out / delete ──────────────────────────────────────────────────── */

export async function signOutUser(): Promise<void> {
  const a = firebaseAuth;
  if (a) {
    await signOut(a).catch(() => undefined);
  }
  clearLocalUser();
  const store = useAppStore.getState();
  store.setIdentity({ uid: null, isAdmin: false });
  dispatchLocalAuthChange(null);
}

/**
 * Deletes the Firebase Auth account.
 *
 * Only usable when the user signed in with a *password or Google* credential.
 * Anonymous accounts have no credential to re-authenticate with, so the server
 * endpoint must handle that case.
 */
export async function deleteAuthAccount(currentPassword?: string): Promise<void> {
  const a = requireAuth();
  const user = a.currentUser;
  if (!user) throw new AuthActionError({ code: "unavailable", message: "سجّل الدخول أولاً." });

  try {
    if (!user.isAnonymous && currentPassword) {
      await reauthenticateWithCredential(
        user,
        emailCredential(user.email ?? "", currentPassword)
      );
    }
    await user.delete();
  } catch (err) {
    wrap(err);
  }
}
