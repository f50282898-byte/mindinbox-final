"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthActionError,
  changeEmail,
  changePassword,
  isEmailVerified,
  sendVerification,
  signOutUser,
} from "@/lib/auth/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/errors";
import { firebaseConfigured } from "@/lib/firebase";
import { useLocale } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeProvider";

interface Entitlements {
  tier: string;
  trialActive: boolean;
  trialDaysLeft: number;
  expiresAt: number | null;
  source: string;
}

/**
 * The account page.
 *
 * Three groups, in the order that matters to a person:
 *   1. who you are (email, verification, sign out)
 *   2. preferences (language, theme) â€” local, instant, no round trip
 *   3. your data (export, delete) â€” export first, delete last, and never
 *      silently: deletion asks for the password and names what will go.
 *
 * Export is deliberately above delete and both are independent, so a user can
 * take their data with them and still keep the account.
 */
export function AccountPanel() {
  const router = useRouter();
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme } = useTheme();

  const [email, setEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [verified, setVerified] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // change password / email
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // delete
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const auth = firebaseConfigured;

  const idToken = useCallback(async (): Promise<string | null> => {
    const { auth: a } = await import("@/lib/firebase");
    const user = a?.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, []);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;

    void (async () => {
      const { auth: a } = await import("@/lib/firebase");
      const user = a?.currentUser;
      if (!user || cancelled) return;

      setEmail(user.email);
      setIsAnonymous(user.isAnonymous);
      setVerified(user.emailVerified);

      // Entitlements are asked of the server, which derives them from
      // subscriptions / grants / trial. Never computed on the client.
      const token = await idToken().catch(() => null);
      if (!token || cancelled) return;
      try {
        const res = await fetch("/api/auth/entitlements", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) setEntitlements((await res.json()) as Entitlements);
      } catch {
        // Leave it null; the section renders an honest "unavailable".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, idToken]);

  async function exportData() {
    setBusy("export");
    setError(null);
    setNotice(null);
    try {
      const token = await idToken();
      if (!token) throw new AuthActionError({ code: "unavailable", message: "سجّل الدخول أولاً." });

      const res = await fetch("/api/account", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        throw new AuthActionError({ code: "export", message: "تعذّر تصدير البيانات." });
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mind-in-a-box-data.json";
      a.click();
      URL.revokeObjectURL(url);
      setNotice("نُزّل ملف بياناتك. احتفظ به إن أردت.");
    } catch (err) {
      setError(err instanceof AuthActionError ? err.message : "تعذّر تصدير البيانات.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Deletion, in the only safe order: Firestore first, then the Auth account.
   * Reversing it would strand data behind an account nobody can sign into.
   */
  async function deleteAccount() {
    setBusy("delete");
    setError(null);
    setNotice(null);
    try {
      const token = await idToken();
      const { auth: a } = await import("@/lib/firebase");
      const uid = a?.currentUser?.uid;
      if (!token || !uid) {
        throw new AuthActionError({ code: "unavailable", message: "سجّل الدخول أولاً." });
      }

      const dataRes = await fetch("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "x-confirm-delete": uid },
      });
      if (!dataRes.ok) {
        const body = (await dataRes.json().catch(() => null)) as { message?: string } | null;
        throw new AuthActionError({
          code: "delete-data",
          message: body?.message ?? "تعذّر حذف البيانات. لم يُحذف حسابك.",
        });
      }

      const authRes = await fetch("/api/account/delete-auth", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid }),
      });
      if (!authRes.ok) {
        const body = (await authRes.json().catch(() => null)) as { message?: string } | null;
        throw new AuthActionError({
          code: "delete-auth",
          message:
            body?.message ??
            "حُذفت بياناتك، وتعذّر حذف حساب الدخول. سجّل الدخول وأعد المحاولة.",
        });
      }

      await signOutUser();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof AuthActionError ? err.message : "تعذّر حذف الحساب.");
    } finally {
      setBusy(null);
      setDeleteOpen(false);
    }
  }

  if (!auth) {
    return (
      <div className="glass p-7">
        <h1 className="display-arabic text-2xl font-bold text-gold-light">الحساب</h1>
        <p className="display-arabic mt-4 leading-loose text-gold-muted">
          الحسابات غير مهيأة في هذا التطبيق بعد.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-12 sm:py-16">
      <header>
        <h1 className="display-arabic text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          الحساب
        </h1>
        <p className="display-latin mt-1 text-lg text-gold-muted/70">Account</p>
      </header>

      {/* â”€â”€ 1. identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Section title="بيانات الحساب">
        <Row label="البريد الإلكتروني" value={isAnonymous ? "حساب ضيف" : (email ?? "â€”")} />

        {!isAnonymous && verified && (
          <Notice kind="ok">بريدك مُفعّل.</Notice>
        )}

        {!isAnonymous && !verified && (
          <>
            <Notice kind="warn">بريدك غير مُفعّل بعد. بعض الوظائف تحتاج تفعيلاً.</Notice>
            <Button
              onClick={() => {
                void (async () => {
                  setBusy("verify");
                  setError(null);
                  try {
                    const { auth: a } = await import("@/lib/firebase");
                    if (a?.currentUser) await sendVerification(a.currentUser);
                    setNotice("أُرسلت رسالة تفعيل إلى بريدك.");
                  } catch (err) {
                    setError(err instanceof AuthActionError ? err.message : "تعذّر الإرسال.");
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
              disabled={busy !== null}
              variant="ghost"
            >
              {busy === "verify" ? "جارٍ الإرسال…" : "أرسل رسالة تفعيل"}
            </Button>
            <Button
              onClick={() => {
                void (async () => {
                  const { auth: a } = await import("@/lib/firebase");
                  // No non-null assertion: the session can expire between render and
                  // click, and `a` itself is null when Firebase is not configured.
                  // `isEmailVerified` reports `false` for a missing user, which is
                  // the honest answer — previously this threw
                  // "Cannot read properties of null (reading 'emailVerified')".
                  setVerified(await isEmailVerified(a?.currentUser));
                })();
              }}
              variant="ghost"
            >
              تحقّقت من الرابط، أعد الفحص
            </Button>
          </>
        )}

        {isAnonymous && (
          <Notice kind="warn">
            أنت داخل كضيف.{" "}
            <a href="/enter" className="underline underline-offset-4">
              أنشئ حساباً
            </a>{" "}
            وسنحفظ سجلّك تحت نفس المعرّف.
          </Notice>
        )}

        {entitlements && (
          <>
            <Row label="المستوى" value={tierLabel(entitlements.tier, t)} />
            <Row
              label="الأساس"
              value={sourceLabel(entitlements.source, t)}
            />
            {entitlements.trialActive && (
              <Row label="تنتهي التجربة" value={`بعد ${entitlements.trialDaysLeft} يوم`} />
            )}
          </>
        )}

        <Button
          onClick={() => {
            void (async () => {
              await signOutUser();
              router.push("/");
              router.refresh();
            })();
          }}
          variant="ghost"
        >
          تسجيل الخروج
        </Button>
      </Section>

      {/* â”€â”€ 2. preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Section title="التفضيلات">
        <Row label="اللغة">
          <div className="flex gap-1.5" role="group" aria-label="اللغة">
            {(["ar", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                aria-pressed={locale === l}
                className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                  locale === l
                    ? "border border-gold/50 bg-gold/12 text-gold-light"
                    : "border border-gold/20 text-gold-muted/70 hover:text-gold-light"
                }`}
              >
                {l === "ar" ? "العربية" : "English"}
              </button>
            ))}
          </div>
        </Row>

        <Row label="المظهر">
          <div className="flex gap-1.5" role="group" aria-label="المظهر">
            {(["dark", "light"] as const).map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => setTheme(th)}
                aria-pressed={theme === th}
                className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                  theme === th
                    ? "border border-gold/50 bg-gold/12 text-gold-light"
                    : "border border-gold/20 text-gold-muted/70 hover:text-gold-light"
                }`}
              >
                {th === "dark" ? "داكن" : "فاتح"}
              </button>
            ))}
          </div>
        </Row>
        <p className="text-xs leading-relaxed text-ink-3">
          تُحفظ اللغة والمظهر على هذا الجهاز. ربطهما بالحساب يأتي لاحقاً.
        </p>
      </Section>

      {/* â”€â”€ password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!isAnonymous && (
        <Section title="كلمة المرور">
          <Field
            id="cur-pw"
            label="كلمة المرور الحالية"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <Field
            id="new-pw"
            label="كلمة المرور الجديدة"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            hint={`${MIN_PASSWORD_LENGTH} محارف على الأقل.`}
          />
          <Button
            onClick={() => {
              void (async () => {
                setBusy("pw");
                setError(null);
                setNotice(null);
                try {
                  await changePassword(currentPassword, newPassword);
                  setNotice("حُدّثت كلمة المرور.");
                  setCurrentPassword("");
                  setNewPassword("");
                } catch (err) {
                  setError(err instanceof AuthActionError ? err.message : "تعذّر التغيير.");
                } finally {
                  setBusy(null);
                }
              })();
            }}
            disabled={busy !== null || !currentPassword || newPassword.length < MIN_PASSWORD_LENGTH}
          >
            {busy === "pw" ? "جارٍ الحفظ…" : "غيّر كلمة المرور"}
          </Button>
        </Section>
      )}

      {/* â”€â”€ email change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!isAnonymous && (
        <Section title="تغيير البريد الإلكتروني">
          <Field
            id="new-email"
            label="البريد الجديد"
            type="email"
            value={newEmail}
            onChange={setNewEmail}
            autoComplete="email"
          />
          <Field
            id="cur-pw-email"
            label="كلمة المرور الحالية"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <Button
            onClick={() => {
              void (async () => {
                setBusy("email");
                setError(null);
                setNotice(null);
                try {
                  await changeEmail(newEmail, currentPassword);
                  setNotice("أُرسلت رسالة تأكيد إلى البريد الجديد.");
                  setNewEmail("");
                  setCurrentPassword("");
                } catch (err) {
                  setError(err instanceof AuthActionError ? err.message : "تعذّر التغيير.");
                } finally {
                  setBusy(null);
                }
              })();
            }}
            disabled={busy !== null || !newEmail.trim() || !currentPassword}
            variant="ghost"
          >
            {busy === "email" ? "جارٍ الإرسال…" : "غيّر البريد الإلكتروني"}
          </Button>
        </Section>
      )}

      {/* â”€â”€ 3. data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Section title="بياناتك">
        <p className="display-arabic text-sm leading-loose text-gold-muted/75">
          نزّل نسخة كاملة من بياناتك كملف JSON. صدّرها قبل أن تحذف حسابك إن أردت الاحتفاظ بها.
        </p>
        <Button onClick={() => void exportData()} disabled={busy !== null} variant="ghost">
          {busy === "export" ? "جارٍ التصدير…" : "صدّر بياناتي (JSON)"}
        </Button>
      </Section>

      <Section title="حذف الحساب" danger>
        {!deleteOpen ? (
          <>
            <p className="display-arabic text-sm leading-loose text-gold-muted/75">
              الحذف نهائي. سيُحذف ملفك وكل ما كتبته في المفكرة والمتتبع، ولا يمكن استرجاعه.
            </p>
            <Button onClick={() => setDeleteOpen(true)} variant="ghost">
              حذف حسابي
            </Button>
          </>
        ) : (
          <>
            <Notice kind="warn">
              سيُحذف: حسابك، ومقالاتك، ومدخلاتك اليومية، وأي بيانات مرتبطة بك.
            </Notice>
            <Field
              id="del-confirm"
              label="اكتب «احذف» للتأكيد"
              value={deleteConfirm}
              onChange={setDeleteConfirm}
            />
            <Field
              id="del-pw"
              label="كلمة المرور الحالية"
              type="password"
              value={deletePassword}
              onChange={setDeletePassword}
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => void deleteAccount()}
                disabled={
                  busy !== null ||
                  deleteConfirm.trim() !== "احذف" ||
                  (isAnonymous ? false : !deletePassword)
                }
                variant="ghost"
              >
                {busy === "delete" ? "جارٍ الحذف…" : "تأكيد الحذف"}
              </Button>
              <Button onClick={() => setDeleteOpen(false)} variant="ghost">
                تراجع
              </Button>
            </div>
          </>
        )}
      </Section>

      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
    </div>
  );
}

/* â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function tierLabel(tier: string, t: (p: { ar: string; en: string }) => string): string {
  return t({
    ar: tier === "sanctum" ? "المحراب" : tier === "oracle" ? "العرّاف" : "الزائر",
    en: tier === "sanctum" ? "The Sanctum" : tier === "oracle" ? "The Oracle" : "The Free Seeker",
  });
}

function sourceLabel(source: string, t: (p: { ar: string; en: string }) => string): string {
  const map: Record<string, { ar: string; en: string }> = {
    subscription: { ar: "اشتراك ساري", en: "Active subscription" },
    grant: { ar: "منحة", en: "Grant" },
    trial: { ar: "تجربة مجانية", en: "Free trial" },
    admin: { ar: "حساب إداري", en: "Administrator" },
    default: { ar: "المستوى الافتراضي", en: "Default tier" },
  };
  return t(map[source] ?? map.default);
}

function Section({
  title,
  children,
  danger = false,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`glass p-6 ${danger ? "border-gold/35" : ""}`}
      aria-label={title}
    >
      <h2 className="display-arabic mb-4 text-lg font-bold text-gold-light">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gold/10 pb-2 last:border-0">
      <span className="display-arabic text-sm text-gold-muted/70">{label}</span>
      <span className="text-sm text-gold-light">{children ?? value}</span>
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
    <div>
      <label htmlFor={id} className="display-arabic mb-1.5 block text-sm text-gold-light">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
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
      className={`w-fit rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40 ${
        variant === "primary" ? "btn-gold" : "btn-ghost"
      }`}
    >
      {children}
    </button>
  );
}

function Notice({
  kind,
  children,
}: {
  kind: "ok" | "warn" | "error";
  children: React.ReactNode;
}) {
  const cls =
    kind === "error"
      ? "border border-gold/45 bg-gold/[0.10] text-gold-light"
      : kind === "warn"
        ? "border border-gold/30 bg-gold/[0.06] text-gold-muted"
        : "border border-gold/25 bg-gold/[0.05] text-gold-muted";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {children}
    </p>
  );
}

export default AccountPanel;
