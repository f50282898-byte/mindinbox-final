"use client";

import { AnimatePresence, motion } from "framer-motion";
import * as Icons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useShell } from "@/lib/shell-config";
import { NAV_GROUPS, groupItems, isActive, type NavItem } from "@/lib/nav";
import { useTheme } from "@/components/ThemeProvider";

/* ─────────────────────────── shared bits ─────────────────────────── */

function iconFor(name: string) {
  const Cmp = (Icons as unknown as Record<string, typeof Icons.Home>)[name];
  return Cmp ?? Icons.Sparkles;
}

function useOnEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}

/**
 * Traps Tab focus inside `container` while active, and restores focus to the
 * previously focused element on close.
 */
function useFocusTrap(active: boolean, container: React.RefObject<HTMLElement>) {
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const node = container.current;
    if (!node) return;

    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Focus the first control (or the panel itself).
    const first = focusables()[0];
    (first ?? node).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && (activeEl === firstEl || !node.contains(activeEl))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [active, container]);
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Parchment" : "الوضع الداكن";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
    >
      {theme === "dark" ? <Icons.Sun className="size-4" /> : <Icons.Moon className="size-4" />}
      {!compact && <span>{label}</span>}
    </button>
  );
}

function LocaleToggle() {
  const { locale, toggle, t } = useLocale();
  const next = locale === "ar" ? "English" : "العربية";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t({ ar: "تبديل اللغة", en: "Switch language" })}
      title={t({ ar: "تبديل اللغة", en: "Switch language" })}
      className="flex items-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
      dir="ltr"
    >
      <Icons.Languages className="size-4" />
      <span>{next}</span>
    </button>
  );
}

/* ─────────────────────────── desktop rail ─────────────────────────── */

function RailLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = iconFor(item.icon);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? t(item.label) : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        active
          ? "bg-gold/12 text-gold-light"
          : "text-gold-muted hover:bg-gold/[0.06] hover:text-gold-light"
      }`}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-gold"
          transition={{ duration: 0.25 }}
        />
      )}
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18 }}
            className="display-arabic truncate text-[15px]"
          >
            {t(item.label)}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

function DesktopRail() {
  const { items, railCollapsed, setRailCollapsed } = useShell();
  const { t } = useLocale();
  const label = t({ ar: "التنقل الرئيسي", en: "Main navigation" });

  return (
    <nav
      aria-label={label}
      className="glass-strong fixed inset-y-0 start-0 z-40 hidden w-[68px] flex-col border-e border-gold/12 md:flex"
      style={{ width: railCollapsed ? 68 : 248 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 pt-5 pb-4">
        <Link
          href="/"
          aria-label={t({ ar: "عقل في صندوق — الصفحة الرئيسية", en: "Mind in a Box — home" })}
          className="gold-glow flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-black/60 text-gold-light transition-colors hover:border-gold/70"
        >
          <span className="display-arabic text-lg font-bold leading-none">ع</span>
        </Link>
        <AnimatePresence initial={false}>
          {!railCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="display-arabic whitespace-nowrap text-base text-gold-light"
            >
              {t({ ar: "عقل في صندوق", en: "Mind in a Box" })}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="hairline mx-3" />

      {/* Grouped sections */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group) => {
          const groupItemsList = groupItems(items, group.id);
          if (groupItemsList.length === 0) return null;
          return (
            <div key={group.id} className="mb-4 last:mb-0">
              {!railCollapsed && (
                <p className="px-3 pb-1.5 text-[10px] tracking-[0.22em] text-gold-muted/45">
                  {t(group.label).toUpperCase()}
                </p>
              )}
              {railCollapsed && <div className="mx-3 mb-2 h-px bg-gold/10" />}
              <ul className="flex flex-col gap-0.5">
                {groupItemsList.map((item) => (
                  <li key={item.id}>
                    <RailLink item={item} collapsed={railCollapsed} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Footer: toggles + collapse */}
      <div className="border-t border-gold/10 p-3">
        <div className={railCollapsed ? "flex flex-col items-center gap-2" : "flex flex-col gap-2"}>
          <LocaleToggle />
          <ThemeToggle compact={railCollapsed} />
          <button
            type="button"
            onClick={() => setRailCollapsed(!railCollapsed)}
            aria-expanded={!railCollapsed}
            aria-label={t({ ar: "طيّ الشريط الجانبي", en: "Collapse sidebar" })}
            className="flex items-center justify-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
          >
            <Icons.PanelLeftClose
              className={`size-4 transition-transform ${railCollapsed ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {!railCollapsed && <span>{t({ ar: "طيّ", en: "Collapse" })}</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────── mobile bar ─────────────────────────── */

function BottomLink({ item }: { item: NavItem }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = iconFor(item.icon);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors ${
        active ? "text-gold-light" : "text-gold-muted/70"
      }`}
    >
      <span className="relative">
        <Icon className="size-5" aria-hidden="true" />
        {active && (
          <span className="absolute -bottom-1 start-1/2 size-1 -translate-x-1/2 rounded-full bg-gold" />
        )}
      </span>
      <span className="text-[10px] leading-tight">{t(item.short)}</span>
    </Link>
  );
}

/* ─────────────────────────── more sheet ─────────────────────────── */

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { overflow } = useShell();
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useOnEscape(open, onClose);
  useFocusTrap(open, panelRef);

  // Prevent background scroll while the sheet covers the screen.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 md:hidden"
        >
          <button
            type="button"
            aria-label={t({ ar: "إغلاق", en: "Close" })}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-volcanic/85 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong absolute inset-x-0 bottom-0 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gold/25" aria-hidden="true" />
            <h2 id={titleId} className="display-arabic mb-4 text-lg text-gold-light">
              {t({ ar: "المزيد", en: "More" })}
            </h2>
            <ul className="grid grid-cols-2 gap-2">
              {overflow.map((item) => {
                const Icon = iconFor(item.icon);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className="flex items-center gap-2.5 rounded-2xl border border-gold/12 px-4 py-3 text-sm text-gold-muted transition-colors hover:border-gold/40 hover:text-gold-light"
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t(item.label)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex justify-center gap-3">
              <LocaleToggle />
              <ThemeToggle compact />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MobileMoreTrigger() {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex w-full flex-col items-center justify-center gap-1 px-1 py-2.5 text-gold-muted/70 transition-colors"
        >
          <Icons.MoreHorizontal className="size-5" aria-hidden="true" />
          <span className="text-[10px] leading-tight">{t({ ar: "المزيد", en: "More" })}</span>
        </button>
      </li>
      <MoreSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MobileShell() {
  const { primary } = useShell();
  const { t } = useLocale();

  // Four destinations plus "More" fills the five-column bar. The brief calls
  // for exactly five primary items and a sheet for the overflow, so the fifth
  // slot is the sheet trigger rather than a fifth link.
  const items = primary.slice(0, 4);

  return (
    <div className="md:hidden">
      <nav
        aria-label={t({ ar: "التنقل السريع", en: "Quick navigation" })}
        className="glass-strong fixed inset-x-0 bottom-0 z-40 border-t border-gold/12 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <BottomLink item={item} />
            </li>
          ))}
          <MobileMoreTrigger />
        </ul>
      </nav>
    </div>
  );
}

/* ─────────────────────────── export ─────────────────────────── */

/**
 * Publishes the rail width as `--rail-w` so page content can inset itself.
 *
 * A sibling spacer `<div>` does not indent the content after it — the element
 * that follows still takes the full width and slides under the fixed rail.
 * Padding on the content is the only thing that works, and a custom property
 * keeps it in sync with the collapse state.
 */
function RailWidthPublisher({ width }: { width: number }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--rail-w", `${width}px`);
    return () => {
      root.style.removeProperty("--rail-w");
    };
  }, [width]);
  return null;
}

/**
 * Responsive shell.
 *
 * Desktop: collapsible glass rail (state persisted).
 * Mobile: 5-item bottom bar + "More" sheet. No hamburger.
 */
export function Shell() {
  const { railCollapsed } = useShell();
  const width = railCollapsed ? 68 : 248;

  return (
    <>
      <RailWidthPublisher width={width} />
      <DesktopRail />
      <MobileShell />
    </>
  );
}