/**
 * Firebase Auth error codes → Arabic messages.
 *
 * The browser SDK throws codes like `auth/invalid-email`; showing them raw is
 * both unreadable and, in a few cases, an information leak (distinguishing
 * "email already in use" from other failures tells an attacker whether an
 * account exists). We translate to a fixed set of Arabic sentences.
 *
 * `auth/email-already-in-use` deliberately does **not** say the address is
 * registered. Signup will offer to sign in instead, without confirming that the
 * address exists.
 */

export type FriendlyAuthError = {
  /** Stable key for programmatic branching (e.g. offer sign-in instead). */
  code: string;
  /** Final Arabic sentence. Never contains the raw SDK message. */
  message: string;
};

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
  "auth/user-disabled": "هذا الحساب معطّل. تواصل معنا عبر صفحة الحساب.",
  "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
  "auth/wrong-password": "كلمة المرور غير صحيحة.",
  "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/invalid-login-credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/email-already-in-use": "تعذّر إنشاء الحساب بهذا البريد. جرّب تسجيل الدخول.",
  "auth/too-many-requests": "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
  "auth/network-request-failed": "تعذّر الاتصال بالإنترنت. تحقّق من اتصالك.",
  "auth/operation-not-allowed": "طريقة الدخول هذه غير مفعّلة في إعدادات Firebase.",
  "auth/weak-password": "كلمة المرور ضعيفة. استخدم 10 محارف على الأقل.",
  "auth/missing-password": "اكتب كلمة المرور.",
  "auth/popup-closed-by-user": "أُغلقت نافذة الدخول قبل الانتهاء.",
  "auth/cancelled-popup-request": "أُلغي طلب الدخول.",
  "auth/account-exists-with-different-credential":
    "يوجد حساب بهذا البريد، لكن الدخول عبر مزوّد مختلف. سجّل الدخول بالطريقة الأصلية.",
  "auth/requires-recent-login": "سجّل الدخول من جديد ثم أعد المحاولة.",
  "auth/too-many-requests-email": "أُرسلت رسائل كثيرة. انتظر قليلاً قبل طلب رسالة أخرى.",
  // Custom codes, raised by this app rather than the SDK.
  "auth/turnstile-failed": "تعذّر التحقق من أن الطلب بشري. حاول مرة أخرى.",
  "auth/guest-upgrade-failed": "تعذّر حفظ سجل الضيف. سجّل الدخول من جديد.",
  "auth/password-too-short": "كلمة المرور يجب أن تكون 10 محارف على الأقل.",
};

const FALLBACK = "تعذّر إتمام العملية. حاول مرة أخرى.";

/** Maps any thrown value onto a safe Arabic message. */
export function friendlyAuthError(err: unknown): FriendlyAuthError {
  const raw =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";

  // The SDK sometimes prefixes the code; normalise.
  const code = raw.includes("/") ? raw.slice(raw.indexOf("/") + 1) : raw;
  const full = raw ? `auth/${code}` : "";

  const message = MESSAGES[full] ?? MESSAGES[code] ?? FALLBACK;

  // Distinguishing "taken" from other failures is an account-enumeration oracle.
  // We keep the signal for our own UI logic but never leak it in the copy.
  if (full === "auth/email-already-in-use") {
    return { code: "email-in-use", message: MESSAGES["auth/email-already-in-use"] };
  }

  return { code: code || "unknown", message };
}

/**
 * Password policy.
 *
 * Length only. Composition rules (one upper, one digit, one symbol) measurably
 * push people toward predictable variants like `Password1!`, and NIST SP
 * 800-63B advises against them. Length plus a breach check is the stronger
 * control; the breach check is Firebase's own on account creation.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} محارف على الأقل.`;
  }
  if (password.length > 4096) {
    return "كلمة المرور طويلة جداً.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "اكتب بريدك الإلكتروني.";
  // Deliberately permissive: the only authority on validity is Firebase, and a
  // stricter client-side regex rejects valid addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return "صيغة البريد الإلكتروني غير صحيحة.";
  }
  return null;
}
