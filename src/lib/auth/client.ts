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
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
  type Auth,
} from "firebase/auth";
import { auth as firebaseAuth } from "@/lib/firebase";
import "@/lib/firebase/profile";
import { friendlyAuthError, validateEmail, validatePassword, type FriendlyAuthError } from "@/lib/auth/errors";

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

/* ── guest ──────────────────────────────────────────────────────────────── */

/**
 * Signs in anonymously.
 *
 * `signInAnonymously` must be enabled in the Firebase console. If a guest
 * already exists on this device it is returned unchanged, so pressing the
 * button twice does not burn through two sets of local state.
 */
export async function continueAsGuest(): Promise<User> {
  const a = requireAuth();
  await ensurePersistence();

  try {
    if (a.currentUser && a.currentUser.isAnonymous) return a.currentUser;
    const cred = await signInAnonymously(a);
    return cred.user;
  } catch (err) {
    wrap(err);
  }
}

/* ── email + password ───────────────────────────────────────────────────── */

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const a = requireAuth();
  const emailError = validateEmail(email);
  if (emailError) throw new AuthActionError({ code: "invalid-email", message: emailError });
  if (!password) throw new AuthActionError({ code: "missing-password", message: "اكتب كلمة المرور." });

  await ensurePersistence();
  try {
    const cred = await signInWithEmailAndPassword(a, email.trim(), password);
    return cred.user;
  } catch (err) {
    wrap(err);
  }
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
  const a = requireAuth();
  const emailError = validateEmail(email);
  if (emailError) throw new AuthActionError({ code: "invalid-email", message: emailError });
  const passwordError = validatePassword(password);
  if (passwordError) {
    throw new AuthActionError({ code: "password-too-short", message: passwordError });
  }

  await ensurePersistence();
  const cleanEmail = email.trim();
  const current = a.currentUser;

  try {
    if (current?.isAnonymous) {
      // Upgrade in place: same uid, guest history preserved.
      const cred = await linkWithCredential(current, emailCredential(cleanEmail, password));
      const user = cred.user;
      if (displayName?.trim()) {
        // Best effort; a failure here must not lose the account.
        await user.updateProfile({ displayName: displayName.trim() }).catch(() => undefined);
      }
      await sendEmailVerification(user).catch(() => undefined);
      return user;
    }

    const cred = await createUserWithEmailAndPassword(a, cleanEmail, password);
    const user = cred.user;
    if (displayName?.trim()) {
      await user.updateProfile({ displayName: displayName.trim() }).catch(() => undefined);
    }
    await sendEmailVerification(user).catch(() => undefined);
    return user;
  } catch (err) {
    wrap(err);
  }
}

/* ── Google ─────────────────────────────────────────────────────────────── */

export async function signInWithGoogle(): Promise<User> {
  const a = requireAuth();
  await ensurePersistence();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const current = a.currentUser;
  try {
    if (current?.isAnonymous) {
      // Same uid after the upgrade, same as the password path.
      const cred = await linkWithPopup(current, provider);
      return cred.user;
    }
    const cred = await signInWithPopup(a, provider);
    return cred.user;
  } catch (err) {
    wrap(err);
  }
}

/* ── email verification ─────────────────────────────────────────────────── */

export async function sendVerification(user: User): Promise<void> {
  try {
    await sendEmailVerification(user);
  } catch (err) {
    wrap(err);
  }
}

export async function isEmailVerified(user: User): Promise<boolean> {
  // Reload so a click on the emailed link is observed.
  try {
    await user.reload();
  } catch {
    return user.emailVerified;
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
  if (!a) return;
  await signOut(a).catch(() => undefined);
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
