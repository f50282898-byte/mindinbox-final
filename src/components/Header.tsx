"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { Logo } from "@/components/Logo";
import { desktopPrimary, mobilePrimary, type NavItem, FALLBACK_NAV } from "@/lib/nav";
import { useLocale } from "@/lib/i18n";
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
  const { t } = useLocale();
  const { theme, toggle } = useTheme();
  const items = desktopPrimary(FALLBACK_NAV);

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
              href="/enter"
              className="hidden sm:flex items-center gap-2 rounded-full border border-gold/25 px-4 py-2 text-sm font-medium text-gold-light transition-colors hover:bg-gold/5"
            >
              <span>المدخل</span>
            </Link>

            <button
              type="button"
              onClick={() => document.documentElement.dataset.theme === "light" ? document.documentElement.dataset.theme = "dark" : document.documentElement.dataset.theme = "light"}
              aria-label="تبديل الثيم"
              title="تبديل الثيم"
              className="flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
            >
              {document.documentElement.dataset.theme === "light" ? (
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
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
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
 * Mobile bottom tab bar — 4 primary items, fixed, safe-area aware.
 * Touch targets ≥ 44px, no top chrome on mobile.
 */
export function MobileBottomBar() {
  const pathname = usePathname();
  const { t } = useLocale();
  const items = mobilePrimary(FALLBACK_NAV);

  return (
    <nav
      aria-label="التنقل السريع"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
    >
      <div className="glass-strong border-t border-gold/12">
        <ul className="grid grid-cols-4" role="tablist">
          {mobilePrimary(FALLBACK_NAV).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = iconFor(item.icon);
            return (
              <li key={item.id} role="presentation">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  role="tab"
                  aria-selected={active}
                  className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors ${
                    active ? "text-gold-light" : "text-gold-muted/70"
                  }`}
                >
                  <span className="relative" aria-hidden="true">
                    {(() => {
                      const Icon = iconFor(item.icon);
                      return <Icon className="size-5" />;
                    })()}
                    {active && (
                      <span className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-gold" />
                    )}
                  </span>
                  <span className="text-[10px] leading-tight truncate">{item.short.ar}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
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
  const { theme } = useTheme();

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

          <button
            type="button"
            onClick={() => document.documentElement.dataset.theme === "light" ? document.documentElement.dataset.theme = "dark" : document.documentElement.dataset.theme = "light"}
            aria-label="تبديل الثيم"
            title="تبديل الثيم"
            className="flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="23" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}