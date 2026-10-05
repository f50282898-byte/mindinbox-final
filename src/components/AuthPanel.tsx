"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthActionError,
  confirmReset,
  continueAsGuest,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUp,
} from "@/lib/auth/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/errors";
import { firebaseConfigured } from "@/lib/firebase";
import {
  FirebaseRequired,
  useFirebaseNotice,
} from "@/lib/firebase/FirebaseRequired";
import { Turnstile } from "@/components/Turnstile";
import { Logo } from "@/components/Logo";

type Mode = "signin" | "signup" | "forgot" | "reset";

const FREE_ATTEMPTS = 5;

/**
 * Account entry.
 *
 * One panel, four modes, so the whole auth surface is a single focusable
 * region with no page transitions — tabbing through it must not lose your place
 * or strand focus behind a dialog.
 *
 * The guest path matters: it is the only way to try the app without an account,
 * and upgrading it later keeps the same uid (see `linkWithCredential` in
 * `src/lib/auth/client.ts`), so nothing a guest wrote is lost.
 */
export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);

  // Logs the missing-variable names to the console, once per session. See the note on
  // the unavailable screen below for why this is not shown to the reader.
  useFirebaseNotice("/enter");

  // A new tab starts from a clean slate.
  const reset = useCallback(() => {
    setError(null);
    setNotice(null);
    setPassword("");
    setTurnstileToken(null);
    setTurnstileNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    reset();
  }, [mode, reset]);

  async function withTurnstile(action: () => Promise<void>) {
    setError(null);
    setNotice(null);

    if (mode === "signup") {
      if (!turnstileToken) {
        setError("أكمل التحقق الأمني أولاً.");
        return;
      }
      setBusy(true);
      try {
        // Server-side check first. The widget's own callback proves nothing.
        const res = await fetch("/api/auth/turnstile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: turnstileToken }),
        });
        if (!res.ok) {
          setError("تعذّر التحقق الأمني. أعد المحاولة.");
          setTurnstileNonce((n) => n + 1);
          return;
        }
      } catch {
        setError("تعذّر الاتصال للتحقق الأمني. تحقّق من اتصالك.");
        return;
      } finally {
        setBusy(false);
      }
    }

    setBusy(true);
    try {
      await action();
    } catch (err) {
      if (err instanceof AuthActionError) {
        setError(err.message);
        // A used Turnstile token is single-use, so a failed signup needs a new
        // challenge even when the failure was something else.
        if (mode === "signup") setTurnstileNonce((n) => n + 1);
      } else {
        setError("تعذّر إتمام العملية. حاول مرة أخرى.");
      }
    } finally {
      setBusy(false);
    }
  }

  /*
   * Firebase is absent from this build.
   *
   * The reader is told the surface is unavailable and is offered somewhere to go. They
   * are not told which variables are missing: that sentence used to be on this page,
   * and it was a map of the keys worth stealing. The diagnosis now goes to the console
   * (`useFirebaseNotice`), which is the only audience that can act on it.
   */
  if (!firebaseConfigured) {
    return (
      <FirebaseRequired title="المدخل">
        <p>
          تسجيل الدخول غير متاح الآن. يمكنك قراءة الحكمة وحوار الفلاسفة والاقتباسات دون حساب.
        </p>
      </FirebaseRequired>
    );
  }

  /* ── forgot password ─────────────────────────────────────────────────── */
  if (mode === "forgot") {
    return (
      <Card
        title="استعادة كلمة المرور"
        subtitle="أرسلنا إليك رسالة إن كان البريد مسجّلاً."
      >
        <Field
          id="forgot-email"
          label="البريد الإلكتروني"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        {error && <Notice kind="error">{error}</Notice>}
        <Button
          onClick={() =>
            void withTurnstile(async () => {
              await requestPasswordReset(email);
              // Always the same message: confirming which addresses exist
              // would be an account-enumeration oracle.
              setNotice("إن كان البريد مسجّلاً فسيصله رسالة خلال دقائق.");
              setPassword("");
            })
          }
          disabled={busy || !email.trim()}
        >
          {busy ? "جارٍ الإرسال…" : "أرسل رابط الاستعادة"}
        </Button>
        <Back onClick={() => setMode("signin")}>عودة إلى تسجيل الدخول</Back>
      </Card>
    );
  }

  /* ── set a new password from the emailed link ────────────────────────── */
  if (mode === "reset") {
    return (
      <Card title="كلمة مرور جديدة" subtitle="الصق الرمز من الرسالة، ثم اختر كلمة المرور.">
        <Field
          id="reset-code"
          label="رمز الاستعادة"
          value={resetCode}
          onChange={setResetCode}
          autoComplete="one-time-code"
        />
        <Field
          id="reset-password"
          label="كلمة المرور الجديدة"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`${MIN_PASSWORD_LENGTH} محارف على الأقل.`}
        />
        {error && <Notice kind="error">{error}</Notice>}
        {notice && <Notice kind="ok">{notice}</Notice>}
        <Button
          onClick={() =>
            void withTurnstile(async () => {
              await confirmReset(resetCode, password);
              setNotice("حُدّثت كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.");
              setPassword("");
              setTimeout(() => setMode("signin"), 1200);
            })
          }
          disabled={busy || !resetCode.trim() || password.length < MIN_PASSWORD_LENGTH}
        >
          {busy ? "جارٍ الحفظ…" : "احفظ كلمة المرور"}
        </Button>
        <Back onClick={() => setMode("signin")}>عودة إلى تسجيل الدخول</Back>
      </Card>
    );
  }

  /* ── sign in / sign up ──────────────────────────────────────────────── */
  const signingUp = mode === "signup";

  return (
    <Card
      title={signingUp ? "إنشاء حساب" : "تسجيل الدخول"}
      subtitle={
        signingUp
          ? "عشرة محارف على الأقل لكلمة المرور. لا نشترط تركيباً من رموز."
          : undefined
      }
    >
      {/* Tabs. `role=tablist` with real arrow-key roving focus. */}
      <div role="tablist" aria-label="طريقة الدخول" className="mb-6 flex gap-1.5">
        {(
          [
            { id: "signin", label: "دخول" },
            { id: "signup", label: "إنشاء حساب" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setMode(mode === "signin" ? "signup" : "signin");
              }
            }}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm transition-colors ${
              mode === tab.id
                ? "border border-gold/50 bg-gold/12 text-gold-light"
                : "border border-transparent text-gold-muted/70 hover:text-gold-light"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {signingUp && (
        <Field
          id="signup-name"
          label="الاسم (اختياري)"
          value={displayName}
          onChange={setDisplayName}
          autoComplete="name"
        />
      )}

      <Field
        id="auth-email"
        label="البريد الإلكتروني"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
      />

      <Field
        id="auth-password"
        label="كلمة المرور"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={signingUp ? "new-password" : "current-password"}
        hint={signingUp ? `${MIN_PASSWORD_LENGTH} محارف على الأقل.` : undefined}
      />

      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}

      {signingUp && (
        <div className="my-5">
          <Turnstile onToken={setTurnstileToken} resetSignal={turnstileNonce} />
        </div>
      )}

      <Button
        onClick={() =>
          void withTurnstile(async () => {
            if (signingUp) {
              const user = await signUp({ email, password, displayName });
              setNotice(
                user.emailVerified
                  ? "أُنشئ الحساب."
                  : "أُنشئ الحساب. أرسلنا رسالة تفعيل إلى بريدك."
              );
            } else {
              await signInWithEmail(email, password);
            }
            router.push("/dialogue");
            router.refresh();
          })
        }
        disabled={busy || !email.trim() || password.length < (signingUp ? MIN_PASSWORD_LENGTH : 1)}
      >
        {busy ? "لحظة…" : signingUp ? "أنشئ الحساب" : "دخول"}
      </Button>

      <Divider />

      <Button
        variant="ghost"
        onClick={() =>
          void withTurnstile(async () => {
            await signInWithGoogle();
            router.push("/dialogue");
            router.refresh();
          })
        }
        disabled={busy}
      >
        المتابعة بحساب Google
      </Button>

      <Button
        variant="ghost"
        onClick={() =>
          void withTurnstile(async () => {
            await continueAsGuest();
            router.push("/dialogue");
            router.refresh();
          })
        }
        disabled={busy}
      >
        جرّب كضيف ({FREE_ATTEMPTS} محاولات)
      </Button>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-3">
       {KEEP_NOTE}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setMode("forgot")}
          className="text-gold-muted/70 underline-offset-4 hover:text-gold-light hover:underline"
        >
          نسيت كلمة المرور؟
        </button>
        <button
          type="button"
          onClick={() => setMode("reset")}
          className="text-gold-muted/70 underline-offset-4 hover:text-gold-light hover:underline"
        >
          لديّ رمز استعادة
        </button>
        <Link
          href="/pricing"
          className="text-gold-muted/70 underline-offset-4 hover:text-gold-light hover:underline"
        >
          العضويات
        </Link>
      </div>
    </Card>
  );
}

const KEEP_NOTE =
  "الدخول كضيف يمنحك سجلاً كاملاً. إن أنشأت حساباً بعده، يبقى السجل نفسه ولا يبدأ من جديد.";

/* ── presentational pieces ───────────────────────────────────────────────── */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass w-full max-w-md p-7">
      <Logo size={52} className="mb-5" />
      <h1 className="display-arabic text-2xl font-bold text-gold-light">{title}</h1>
      {subtitle && (
        <p className="display-arabic mt-2 text-sm leading-relaxed text-gold-muted/70">{subtitle}</p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="display-arabic mb-1.5 block text-sm text-gold-light">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="panel-inset w-full rounded-2xl px-4 py-3 text-gold-muted placeholder:text-ink-3 focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mb-3 w-full rounded-full px-6 py-3 text-sm font-semibold transition-opacity disabled:opacity-40 ${
        variant === "primary" ? "btn-gold" : "btn-ghost"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-3" aria-hidden="true">
      <span className="hairline flex-1" />
      <span className="text-xs text-ink-3">أو</span>
      <span className="hairline flex-1" />
    </div>
  );
}

function Notice({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`display-arabic mb-4 rounded-xl px-4 py-3 text-sm leading-relaxed ${
        kind === "error"
          ? "border border-gold/40 bg-gold/[0.08] text-gold-light"
          : "border border-gold/25 bg-gold/[0.05] text-gold-muted"
      }`}
    >
      {children}
    </p>
  );
}

function Back({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full text-center text-sm text-gold-muted/65 underline-offset-4 hover:text-gold-light hover:underline"
    >
      {children}
    </button>
  );
}

export default AuthPanel;
