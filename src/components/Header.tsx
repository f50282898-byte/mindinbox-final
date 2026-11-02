"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  MessageSquare,
  NotebookPen,
  Activity,
  User,
  Moon,
  Sun,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { desktopPrimary, FALLBACK_NAV } from "@/lib/nav";

// Backwards-compatible export for any consumers importing MobileBottomBar from Header
export { MobileBottomBar } from "@/components/MobileBottomBar";

export const icons: Record<string, LucideIcon> = {
  BookOpen,
  MessageSquare,
  NotebookPen,
  Activity,
  User,
};

/**
 * AppearanceControls
 *
 * CRITICAL TEST CONTRACT:
 * - Button index 0 MUST be the Language toggle (aria-label matching /English|العربية/)
 * - Button index 1 MUST be the Theme toggle (aria-label matching /فاتح|داكن|light|dark/i)
 * (Verified by living-sanctuary.spec.ts: T1.1.5, T2.3, T3.1)
 */
export function AppearanceControls() {
  const { theme, toggle } = useTheme();
  const { locale, toggle: toggleLocale } = useLocale();
  const ar = locale === "ar";

  return (
    <div className="appearance-controls flex items-center gap-1.5 flex-shrink-0">
      <button
        type="button"
        onClick={toggleLocale}
        aria-label={ar ? "Switch to English" : "التبديل إلى العربية"}
        lang={ar ? "en" : "ar"}
        className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full text-xs font-semibold text-ink-2 hover:text-ink-1 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        {ar ? "EN" : "ع"}
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          ar
            ? theme === "dark"
              ? "تفعيل الوضع الفاتح"
              : "تفعيل الوضع الداكن"
            : theme === "dark"
            ? "Use light theme"
            : "Use dark theme"
        }
        className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full text-ink-2 hover:text-ink-1 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        {theme === "dark" ? (
          <Sun size={18} aria-hidden="true" />
        ) : (
          <Moon size={18} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * Quick Search trigger button
 */
export function SearchTrigger() {
  const { t } = useLocale();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/wisdom?q=${encodeURIComponent(query.trim())}`);
    handleClose();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={t({ ar: "بحث في الملاذ", en: "Search sanctuary" })}
        className="header-search-btn min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full text-ink-2 hover:text-ink-1 hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <Search size={18} aria-hidden="true" />
      </button>

      {/* Lightweight Command Palette Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t({ ar: "البحث السريع", en: "Quick search" })}
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-lg bg-surface-solid border border-hairline rounded-2xl p-4 shadow-2xl surface-glass-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="flex items-center gap-3">
              <Search size={20} className="text-gold flex-shrink-0" aria-hidden="true" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t({
                  ar: "ابحث عن حكمة، فيلسوف، أو موضوع...",
                  en: "Search wisdom, philosopher, or concept...",
                })}
                className="w-full bg-transparent text-ink-1 placeholder:text-ink-3 text-sm focus:outline-none py-2"
              />
              <button
                type="button"
                onClick={handleClose}
                aria-label={t({ ar: "إغلاق", en: "Close" })}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink-1"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </form>
            <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between text-xs text-ink-3">
              <span>{t({ ar: "اضغط Enter للبحث في الحكمة", en: "Press Enter to search Wisdom" })}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 font-mono text-[10px]">Esc</kbd>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Brand Logo & Name
 */
function Brand() {
  const { locale, t } = useLocale();
  return (
    <Link
      href="/"
      className="shell-brand min-h-[44px] min-w-[44px] inline-flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold rounded-lg"
    >
      <Logo
        size={30}
        ariaLabel={t({ ar: "الرئيسية", en: "Home" })}
        priority
      />
      <span className={locale === "ar" ? "display-arabic text-xl font-bold text-gold-light" : "display-latin text-xl font-bold text-gold-light"}>
        {locale === "ar" ? "عقل في صندوق" : "Mind in a Box"}
      </span>
    </Link>
  );
}

/**
 * DesktopHeader
 * Rendered on md:block viewports (>= 768px).
 * Tests strictly expect: header.studio-header.hidden.md:block
 */
export function DesktopHeader() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const { user } = useAuth();

  return (
    <header className="studio-header hidden md:block">
      <div className="studio-header-inner">
        <Brand />

        <nav
          aria-label={locale === "ar" ? "التنقل الرئيسي" : "Main navigation"}
          className="studio-nav"
        >
          {desktopPrimary(FALLBACK_NAV).map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="min-h-[44px] inline-flex items-center px-4 py-2 text-sm rounded-lg transition-colors"
              >
                {item.label[locale]}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <SearchTrigger />
          <Link
            href={user ? "/account" : "/enter"}
            className="studio-account min-h-[44px] inline-flex items-center px-4 py-2 text-xs rounded-full border border-edge-2 hover:border-gold hover:text-gold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            {locale === "ar"
              ? user
                ? "حسابي"
                : "الدخول"
              : user
              ? "Account"
              : "Sign in"}
          </Link>
          <AppearanceControls />
        </div>
      </div>
    </header>
  );
}

/**
 * MobileHeader
 * Rendered on mobile viewports (< 768px).
 * Tests strictly expect: header.studio-header.md:hidden
 */
export function MobileHeader() {
  return (
    <header className="studio-header md:hidden">
      <div className="studio-header-inner flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-1.5">
          <SearchTrigger />
          <AppearanceControls />
        </div>
      </div>
    </header>
  );
}
