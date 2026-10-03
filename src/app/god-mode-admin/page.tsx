import type { Metadata } from "next";

/**
 * Admin shell — structure only, per the current brief.
 *
 * A hand-written page rather than a redirect, because the route has to exist
 * and resolve before the console itself is built. It says plainly that it is
 * not built instead of showing a fake dashboard.
 */
export const metadata: Metadata = {
  title: "لوحة الإدارة",
  robots: { index: false, follow: false, nocache: true },
};

export default function GodModeAdminPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="display-latin text-xs tracking-[0.3em] text-gold-muted/40">GOD MODE</p>
      <h1 className="display-arabic mt-3 text-3xl font-bold text-gold-light">لوحة الإدارة</h1>
      <p className="display-arabic mt-5 leading-loose text-gold-muted">
        هذا الهيكل جاهز، ولم تُبنَ لوحة الإدارة بعد.
      </p>
      <p className="mt-3 leading-relaxed text-gold-muted/70">
        This shell exists; the console itself has not been built yet.
      </p>
      <p className="mt-8 text-xs text-gold-muted/45">
        عند بنائها ستُحمى المطالبة برمز تحقّق، ولا تُعرض بيانات المستخدم الخام.
      </p>
    </div>
  );
}
