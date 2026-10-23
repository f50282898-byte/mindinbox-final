"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import { Logo } from "@/components/Logo";
import { desktopPrimary, mobilePrimary, FALLBACK_NAV } from "@/lib/nav";
import * as Icons from "lucide-react";

/* Icons mapping */
function iconFor(name: string) {
  const Cmp = (Icons as unknown as Record<string, typeof Icons.Home>)[name];
  return Cmp ?? Icons.LayoutDashboard;
}

/**
 * Desktop header — fixed, frosted glass, 12-column grid, max-width container.
 * Contains: logo, 4 primary nav links, account button, theme toggle.
 */
export function DesktopHeader() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user } = useAuth();

  return (
    <header
      className="fixed top-0 start-0 end-0 z-40 glass-strong border-b border-gold/10"
      style={{ maxWidth: "1280px", margin: "0 auto", width: "100%" }}
      role="banner"
    >
      <div className="mx-auto max-w-[1280px] px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo + nav */}
          <div className="flex items-center gap-6 flex-1 min-w-0">
            <Link
              href="/"
              aria-label="عقل في صندوق — الصفحة الرئيسية"
              className="flex items-center gap-2 shrink-0"
            >
              <Logo size={28} ariaLabel="شعار عقل في صندوق" />
              <span className="hidden sm:block display-arabic text-lg font-bold text-gold-light">
                عقل في صندوق
              </span>
            </Link>

            <nav aria-label="التنقل الرئيسي" className="hidden md:flex items-center gap-1">
              {desktopPrimary(FALLBACK_NAV).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = iconFor(item.icon);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-gold/12 text-gold-light"
                        : "text-gold-muted/70 hover:bg-gold/5 hover:text-gold-light"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="hidden sm:inline">{item.label.ar}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Account + Theme */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={user ? "/account" : "/enter"}
              className="hidden sm:flex items-center gap-2 rounded-full border border-gold/25 px-4 py-2 text-sm font-medium text-gold-light transition-colors hover:bg-gold/5 max-w-[140px] truncate"
            >
              <span className="truncate">{user ? (user.displayName || "حسابي") : "المدخل"}</span>
            </Link>

            <button
              type="button"
              onClick={toggle}
              aria-label="تبديل الثيم"
              title="تبديل الثيم"
              className="flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
            >
              {theme === "light" ? (
                <>
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                  <span className="hidden sm:inline">فاتح</span>
                </>
              ) : (
                <>
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                  <span className="hidden sm:inline">داكن</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Mobile bottom tab bar — Native app feel.
 *
 * Floating glass bar at the bottom with 4 primary destinations.
 * Backdrop blur, gold accent on active, and generous 44px+ touch targets.
 */
export function MobileBottomBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل السريع"
      className="fixed bottom-4 left-4 right-4 z-50 md:hidden rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl"
    >
      <ul className="flex items-center justify-center gap-1 px-2 py-2.5" role="tablist">
        {mobilePrimary(FALLBACK_NAV).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.id} role="presentation">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                role="tab"
                aria-selected={active}
                className={`flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-2xl transition-all duration-200 min-w-[56px] ${
                  active
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                    : "text-zinc-400/60 hover:bg-white/[0.03] hover:border-white/10 hover:text-zinc-200"
                }`}
              >
                <span className="relative" aria-hidden="true">
                  {(() => {
                    const Icon = iconFor(item.icon);
                    return <Icon className="size-5" />;
                  })()}
                  {active && (
                    <span className="absolute -top-1 right-1 size-2 -translate-x-1/2 rounded-full bg-amber-500" />
                  )}
                </span>
                <span className="text-[10px] font-medium leading-tight truncate">
                  {item.short.ar}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Mobile header — minimal, only logo + theme toggle (no nav links).
 * Shows on mobile when not on landing page.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const { toggle } = useTheme();
  const { user } = useAuth();

  if (isLanding) return null;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 md:hidden glass-strong border-b border-gold/10"
      style={{ maxWidth: "1280px", margin: "0 auto", width: "100%" }}
      role="banner"
    >
      <div className="mx-auto max-w-[1280px] px-4">
        <div className="flex items-center justify-between h-14">
          <Link
            href="/"
            aria-label="عقل في صندوق — الصفحة الرئيسية"
            className="flex items-center gap-2 shrink-0"
          >
            <Logo size={24} ariaLabel="شعار عقل في صندوق" />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={user ? "/account" : "/enter"}
              className="flex items-center gap-1.5 rounded-full border border-gold/25 px-3 py-1.5 text-xs font-medium text-gold-light transition-colors hover:bg-gold/5 max-w-[110px] truncate"
            >
              <span className="truncate">{user ? (user.displayName || "حسابي") : "المدخل"}</span>
            </Link>

            <button
              type="button"
              onClick={toggle}
              aria-label="تبديل الثيم"
              title="تبديل الثيم"
              className="flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="23" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}