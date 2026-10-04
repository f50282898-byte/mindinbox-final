"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { signInWithEmail, sendVerification } from "@/lib/auth/client";
import { TIER_DEFINITIONS } from "@/lib/tiers";
import { SiteBuilder } from "@/components/admin/SiteBuilder";
import { PricingCheck } from "@/components/admin/PricingCheck";
import { AssistantPanel } from "@/components/admin/AssistantPanel";

/**
 * The console, behind a session that the server already verified.
 *
 * ## The client gate here is convenience, not security
 *
 * This component renders nothing for a reader with no `auth.currentUser`. That is a
 * courtesy — it saves a wasted round trip. The page already returned **404** before any
 * of this shipped, and every API below re-checks `admins/{uid}` on its own. Deleting
 * every line of this file would not make the console reachable to a non-admin.
 *
 * ## Two-factor is recommended, not enforced
 *
 * Enforcing it would mean requiring an Identity Platform upgrade and locking a single
 * admin out of their own console on a bad day. Recommending it, in the console, where
 * the person who can act on it will read it, is the proportionate choice. The note
 * below says what it costs.
 */
export function AdminGate({ uid }: { uid: string | null }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return auth.onAuthStateChanged(async (user) => {
      setSignedIn(Boolean(user));
      setReady(true);
      if (!user) {
        setIsAdmin(false);
        return;
      }
      // Re-verify against the server rather than reading a client flag. The page
      // session says this browser is allowed to *see* the console; only the server can
      // say this user is allowed to *use* it.
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/verify", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      }
    });
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
    } catch {
      // Never say which half was wrong.
      setError("تعذّر تسجيل الدخول. تحقّق من البريد وكلمة المرور.");
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  if (!ready) {
    return (
      <p role="status" className="text-sm text-gold-muted/70">
       جارٍ التحقّق…
      </p>
    );
  }

  if (!signedIn) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
        className="mx-auto flex max-w-sm flex-col gap-4"
      >
        <h1 className="display-arabic text-xl text-gold-light">لوحة الإدارة</h1>
        <label htmlFor="admin-email" className="text-xs text-gold-muted">
          البريد
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-gold-light outline-none focus:border-accent-solid/60"
        />
        <label htmlFor="admin-password" className="text-xs text-gold-muted">
          كلمة المرور
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-gold-light outline-none focus:border-accent-solid/60"
        />
        {error && (
          <p role="alert" className="text-sm text-gold-light">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || email.length === 0 || password.length === 0}
          className="rounded-lg border border-accent-solid/60 px-4 py-2 text-sm text-accent-solid disabled:opacity-40"
        >
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
        <TwoFactorNote />
      </form>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="display-arabic text-xl text-gold-light">لا صلاحية</h1>
        <p className="leading-relaxed text-gold-muted">
          هذا الحساب ليس حساب إدارة. الطلب أُرسل إلى الخادم الذي تحقّق منه بنفسه.
        </p>
        <button
          type="button"
          onClick={() => {
            if (auth?.currentUser?.emailVerified) {
              void sendVerification(auth.currentUser);
              return;
            }
            void auth?.signOut();
          }}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gold-muted"
        >
          {auth?.currentUser?.emailVerified ? "أعد إرسال رسالة التوثيق" : "خروج"}
        </button>
        <TwoFactorNote />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-4">
        <h1 className="display-arabic text-xl text-gold-light">لوحة الإدارة</h1>
        <p dir="ltr" className="text-xs text-ink-3">
          {uid}
        </p>
      </header>

      <TwoFactorNote />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-gold-light">منشئ الموقع</h2>
        <SiteBuilder />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-gold-light">التسعير</h2>
        <PricingCheck />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-gold-light">مساعد الإدارة</h2>
        <AssistantPanel />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-gold-light">المستويات</h2>
        <ul className="grid gap-1 text-xs text-gold-muted/70">
          {Object.entries(TIER_DEFINITIONS).map(([tier, d]) => (
            <li key={tier}>
              {d.name} — {d.priceUsd} {d.period}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * The two-factor recommendation.
 *
 * ## Availability, stated rather than assumed
 *
 * Firebase supports TOTP two-factor on the **Identity Platform** (paid) plan. On the
 * Spark plan it is unavailable. That matters because this console can change a live
 * site's pricing and its navigation, so "turn on 2FA" is not hygiene advice here — it
 * is the difference between one stolen password and a changed homepage.
 *
 * The cost is named in the text rather than discovered later: enabling TOTP multi-factor
 * requires upgrading the project to Identity Platform, which is billed per MAU.
 */
function TwoFactorNote() {
  return (
    <aside className="rounded-xl border border-accent-solid/25 bg-accent-quiet p-4">
      <h3 className="text-xs text-accent-solid">فعّل المصادقة الثنائية</h3>
      <p className="mt-2 text-xs leading-relaxed text-gold-muted">
        هذه اللوحة تغيّر أسعاراً وصفحاتً تعمل لكل الزائرين، فكلمة مرور واحدة قد تكفي لتغيير
        الصفحة الرئيسية. فعّل المصادقة الثنائية (TOTP) من إعدادات Firebase.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-gold-muted/70">
        <strong className="text-gold-muted">تنبيه:</strong> المصادقة الثنائية عبر TOTP تتطلب
        ترقية المشروع إلى Identity Platform، وهي خطة مدفوعة تُحاسب على المستخدم النشط شهرياً.
        على خطة Spark غير متاحة.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-gold-muted/70">
        كل كتابة من اللوحة تُسجَّل في <code className="text-gold-muted">auditLog</code> باسم من
        فعلها، مع القيمة قبل وبعد.
      </p>
    </aside>
  );
}
