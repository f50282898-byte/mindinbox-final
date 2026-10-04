"use client";

import {
  collection,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { motion } from "framer-motion";
import { Plus, Save, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { auth, db, paths } from "@/lib/firebase";
import { FREE_ATTEMPT_LIMIT } from "@/lib/anon-session";
import { sanitizePricing } from "@/lib/tiers";

interface BannerRow {
  headline: string;
  detail: string;
  href: string;
}

interface LibraryRow {
  title: string;
  summary: string;
  videoUrl: string;
  filePath: string;
}

/**
 * Admin Console.
 *
 * Security model:
 *  - Rendering is gated on `isAdmin`, which `useSession` derives from
 *    `/api/admin/verify` — a server-side check of the ID token signature and
 *    the `admin: true` custom claim. The route is not linked from the sidebar.
 *  - Every mutation below is authorised a second time by `firestore.rules`
 *    (`isAdmin()`). Removing this UI does not remove access control, and
 *    showing this UI is not what grants access. The previous build authorised
 *    on `uid === ... || true`, which handed the console to every visitor.
 */
export function AdminConsole() {
  const { state } = useSession();
  const isAdmin = useAppStore((s) => s.isAdmin);

  const [pricing, setPricing] = useState({ oracle: 33, sanctum: 100 });
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [stats, setStats] = useState({ users: 0, sessions: 0, events: 0 });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = useCallback((message: string) => {
    setStatus(message);
    setError(null);
    window.setTimeout(() => setStatus(null), 3500);
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setStatus(null);
  }, []);

  /* ── Load live figures and config ── */
  useEffect(() => {
    if (!isAdmin || !db) return;

    void (async () => {
      try {
        const [users, sessions, events] = await Promise.all([
          getCountFromServer(collection(db, "users")),
          getCountFromServer(collection(db, paths.analyticsSessions)),
          getCountFromServer(collection(db, paths.analyticsEvents)),
        ]);
        setStats({
          users: users.data().count,
          sessions: sessions.data().count,
          events: events.data().count,
        });
      } catch {
        fail("تعذّر تحميل الإحصاءات. تحقّق من قواعد البيانات وصلاحية العلامة.");
      }
    })();

    const priceSnap = onSnapshot(
      doc(db, paths.pricingDoc),
      (snapshot) => {
        if (snapshot.exists()) {
          const clean = sanitizePricing(snapshot.data());
          setPricing({
            oracle: clean.oracle ?? 33,
            sanctum: clean.sanctum ?? 100,
          });
        }
      },
      () => fail("تعذّر قراءة الأسعار.")
    );

    const adsSnap = onSnapshot(
      doc(db, paths.adsDoc),
      (snapshot) => {
        const rows = snapshot.data()?.items;
        if (Array.isArray(rows)) setBanners(rows as BannerRow[]);
      },
      () => fail("تعذّر قراءة لافتات الإعلانات.")
    );

    const librarySnap = onSnapshot(
      doc(db, paths.libraryDoc),
      (snapshot) => {
        const rows = snapshot.data()?.items;
        if (Array.isArray(rows)) setLibrary(rows as LibraryRow[]);
      },
      () => fail("تعذّر قراءة المكتبة.")
    );

    return () => {
      priceSnap();
      adsSnap();
      librarySnap();
    };
  }, [isAdmin, fail]);

  /* ── Mutations ── */
  const savePricing = async () => {
    if (!db) return;
    setBusy(true);
    try {
      await setDoc(doc(db, paths.pricingDoc), pricing, { merge: true });
      useAppStore.getState().setPricing(sanitizePricing(pricing));
      flash("حُفظت الأسعار.");
    } catch {
      fail("رفضت القواعد حفظ الأسعار. تأكّد من وجود العلامة الإدارية.");
    } finally {
      setBusy(false);
    }
  };

  const saveBanners = async (next: BannerRow[]) => {
    if (!db) return;
    setBusy(true);
    try {
      await setDoc(doc(db, paths.adsDoc), { items: next }, { merge: true });
      flash("حُفظت اللافتات الإعلانية.");
    } catch {
      fail("تعذّر حفظ اللافتات.");
    } finally {
      setBusy(false);
    }
  };

  const saveLibrary = async (next: LibraryRow[]) => {
    if (!db) return;
    setBusy(true);
    try {
      await setDoc(doc(db, paths.libraryDoc), { items: next }, { merge: true });
      flash("حُفظت المكتبة.");
    } catch {
      fail("تعذّر حفظ المكتبة.");
    } finally {
      setBusy(false);
    }
  };

  const grantTier = async (uid: string, tier: "oracle" | "sanctum" | "free") => {
    if (!db) return;
    try {
      await setDoc(doc(db, paths.user(uid)), { subscriptionTier: tier }, { merge: true });
      flash(`حُدّث مستوى ${uid.slice(0, 8)}…`);
    } catch {
      fail("تعذّر تحديث المستوى. لا يمكن ترقية نفسك من هنا.");
    }
  };

  /* ── Gates ── */
  if (state === "loading") {
    return <ConsoleShell><p className="display-arabic py-20 text-center text-sm text-gold-muted/60">…جارٍ التحقق</p></ConsoleShell>;
  }
  if (state !== "member" || !isAdmin) {
    return (
      <ConsoleShell>
        <div className="mx-auto max-w-md px-5 py-24 text-center">
          <ShieldCheck className="mx-auto size-9 text-gold/40" aria-hidden="true" />
          <h1 className="gold-text-glow display-arabic mt-6 text-2xl font-bold text-gold-light">
            منطقة ممنوعة
          </h1>
          <p className="display-arabic mt-4 text-sm leading-relaxed text-gold-muted/60">
            هذه المنطقة لا تُفتح إلا لحساب يحمل علامة إدارية موثّقة على الخادم. طلبك غير يحملها.
          </p>
        </div>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell>
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-gold/15 pb-6">
          <div>
            <h1 className="gold-text-glow display-arabic text-2xl font-bold text-gold-light sm:text-3xl">
              وضع الإله · لوحة الإدارة
            </h1>
            <p className="display-latin mt-1 text-[11px] tracking-[0.25em] text-gold-muted/50">
              GOD MODE
            </p>
          </div>
          <button
            type="button"
            onClick={() => void auth?.signOut()}
            className="btn-ghost py-2 text-xs"
          >
            خروج
          </button>
        </header>

        {(status || error) && (
          <p
            role="status"
            className={`mb-6 flex items-center gap-2 text-xs ${error ? "text-red-300/90" : "text-gold/80"}`}
          >
            {error ? <TriangleAlert className="size-4" /> : <ShieldCheck className="size-4" />}
            {error ?? status}
          </p>
        )}

        {/* ── Figures ── */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="المستخدمون" value={stats.users} />
          <Card label="الجلسات" value={stats.sessions} />
          <Card label="أحداث التفاعل" value={stats.events} />
          <Card label="الحد المجاني" value={FREE_ATTEMPT_LIMIT} />
        </section>

        {/* ── Pricing ── */}
        <Panel title="الأسعار" hint="تنعكس فوراً على صفحة العضوية.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="العرّاف — دولار/شهرياً"
              value={pricing.oracle}
              onChange={(v) => setPricing((p) => ({ ...p, oracle: v }))}
            />
            <Field
              label="المحراب — دولار/شهرياً"
              value={pricing.sanctum}
              onChange={(v) => setPricing((p) => ({ ...p, sanctum: v }))}
            />
          </div>
          <Action onClick={() => void savePricing()} disabled={busy}>
            <Save className="size-4" /> حفظ الأسعار
          </Action>
        </Panel>

        {/* ── Upgrade banners (rotate every 3 days) ── */}
        <Panel title="لافتات الترقية" hint="تتناوب كل ثلاثة أيام حسب ترتيبها.">
          <div className="space-y-3">
            {banners.map((row, index) => (
              <BannerEditor
                key={index}
                row={row}
                onChange={(next) =>
                  setBanners((prev) => prev.map((r, i) => (i === index ? next : r)))
                }
                onRemove={() => setBanners((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Action
              onClick={() =>
                setBanners((prev) => [
                  ...prev,
                  { headline: "", detail: "", href: "/membership" },
                ])
              }
            >
              <Plus className="size-4" /> إضافة لافتة
            </Action>
            <Action primary onClick={() => void saveBanners(banners)} disabled={busy}>
              <Save className="size-4" /> حفظ اللافتات
            </Action>
          </div>
        </Panel>

        {/* ── Library (YouTube + PDF) ── */}
        <Panel
          title="المكتبة والمحاضرات"
          hint="filePath يجب أن يبدأ بـ premium-library/ ليطابق storage.rules."
        >
          <div className="space-y-3">
            {library.map((row, index) => (
              <LibraryEditor
                key={index}
                row={row}
                onChange={(next) =>
                  setLibrary((prev) => prev.map((r, i) => (i === index ? next : r)))
                }
                onRemove={() => setLibrary((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Action
              onClick={() =>
                setLibrary((prev) => [
                  ...prev,
                  { title: "", summary: "", videoUrl: "", filePath: "" },
                ])
              }
            >
              <Plus className="size-4" /> إضافة عنصر
            </Action>
            <Action primary onClick={() => void saveLibrary(library)} disabled={busy}>
              <Save className="size-4" /> حفظ المكتبة
            </Action>
          </div>
        </Panel>

        <UserAdmin onGrant={grantTier} />
      </div>
    </ConsoleShell>
  );
}

/** Recent accounts with an inline entitlement control. */
function UserAdmin({ onGrant }: { onGrant: (uid: string, tier: "oracle" | "sanctum" | "free") => void }) {
  const [rows, setRows] = useState<
    Array<{ id: string; email: string | null; displayName: string | null; tier: string }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(25));
    return onSnapshot(
      q,
      (snapshot) =>
        setRows(
          snapshot.docs.map((d) => {
            const data = d.data() as { email?: string; displayName?: string; subscriptionTier?: string };
            return {
              id: d.id,
              email: data.email ?? null,
              displayName: data.displayName ?? null,
              tier: data.subscriptionTier ?? "free",
            };
          })
        ),
      () => setMessage("تعذّر تحميل المستخدمين. تحقّق من أن العلامة الإدارية مضبوطة في القواعد.")
    );
  }, []);

  return (
    <Panel title="المستخدمون" hint="آخر ٢٥ حساباً. التغيير هنا يتطلّب قاعدة البيانات منشورة.">
      {message && <p className="mb-3 text-xs text-gold/70">{message}</p>}
      <ul className="divide-y divide-gold/10">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-gold-light">
                {row.displayName ?? row.email ?? row.id.slice(0, 10)}
              </p>
              <p className="display-latin truncate text-[10px] text-gold-muted/40">{row.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={row.tier}
                onChange={(event) => onGrant(row.id, event.target.value as "oracle" | "sanctum" | "free")}
                aria-label={`مستوى ${row.displayName ?? row.id}`}
                className="field w-auto py-2 text-xs"
              >
                <option value="free">زائر</option>
                <option value="oracle">العرّاف</option>
                <option value="sanctum">المحراب</option>
              </select>
            </div>
          </li>
        ))}
        {!rows.length && !message && (
          <li className="py-4 text-center text-xs text-gold-muted/40">لا حسابات بعد.</li>
        )}
      </ul>
    </Panel>
  );
}

function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-volcanic">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 void-vignette" />
      <div className="relative">{children}</div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-5">
      <p className="text-xs tracking-widest text-gold-muted/55">{label}</p>
      <p className="display-latin mt-2 text-3xl font-bold text-gold-light">{value}</p>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel mt-6 p-6 sm:p-7">
      <h2 className="display-arabic text-lg text-gold-light">{title}</h2>
      {hint && <p className="mt-1.5 text-xs text-gold-muted/50">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Action({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all duration-300 disabled:opacity-40 ${
        primary
          ? "bg-gold text-black hover:bg-gold-light"
          : "border border-gold/30 text-gold hover:border-gold/70 hover:bg-gold/5"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gold-muted/60">{label}</span>
      <input
        type="number"
        min={0}
        max={99999}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="field py-2.5"
      />
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="field py-2.5 text-xs"
    />
  );
}

function BannerEditor({
  row,
  onChange,
  onRemove,
}: {
  row: BannerRow;
  onChange: (next: BannerRow) => void;
  onRemove: () => void;
}) {
  return (
    <motion.div layout className="panel-inset grid gap-2 p-4 sm:grid-cols-[1fr_1fr_auto]">
      <TextInput
        value={row.headline}
        onChange={(headline) => onChange({ ...row, headline })}
        placeholder="العنوان"
      />
      <TextInput
        value={row.detail}
        onChange={(detail) => onChange({ ...row, detail })}
        placeholder="التفصيل"
      />
      <div className="flex gap-2">
        <TextInput
          value={row.href}
          onChange={(href) => onChange({ ...row, href })}
          placeholder="/membership"
        />
        <RemoveButton onClick={onRemove} label="حذف اللافتة" />
      </div>
    </motion.div>
  );
}

function LibraryEditor({
  row,
  onChange,
  onRemove,
}: {
  row: LibraryRow;
  onChange: (next: LibraryRow) => void;
  onRemove: () => void;
}) {
  return (
    <motion.div layout className="panel-inset space-y-2 p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <TextInput
          value={row.title}
          onChange={(title) => onChange({ ...row, title })}
          placeholder="العنوان"
        />
        <RemoveButton onClick={onRemove} label="حذف العنصر" />
      </div>
      <TextInput
        value={row.summary}
        onChange={(summary) => onChange({ ...row, summary })}
        placeholder="وصف مختصر"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <TextInput
          value={row.videoUrl}
          onChange={(videoUrl) => onChange({ ...row, videoUrl })}
          placeholder="رابط يوتيوب (اختياري)"
        />
        <TextInput
          value={row.filePath}
          onChange={(filePath) => onChange({ ...row, filePath })}
          placeholder="premium-library/xxx.pdf"
        />
      </div>
    </motion.div>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 self-center rounded-full p-2.5 text-gold-muted/40 transition-colors hover:text-red-300/85"
    >
      <Trash2 className="size-4" />
    </button>
  );
}