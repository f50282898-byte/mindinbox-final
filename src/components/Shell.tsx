"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { useShell } from "@/lib/shell-config";
import { NAV_GROUPS, groupItems, isActive, type NavItem } from "@/lib/nav";
import { DesktopHeader, MobileHeader, MobileBottomBar } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import * as Icons from "lucide-react";

/*―――――――――――――――――――――――――――――― shared bits ―――――――――――――――――――――――――――――*/

function iconFor(name: string) {
  const Cmp = (Icons as unknown as Record<string, typeof Icons.Home>)[name];
  return Cmp ?? Icons.LayoutDashboard;
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

/* ── desktop rail (collapsible) ――――――――――――――――――――――――――――― */

function RailLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = iconFor(item.icon);

  return (
    <a
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
        <span
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-gold"
        />
      )}
      <span className="size-[18px] shrink-0" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <span className="truncate display-arabic text-sm" aria-hidden={collapsed}>
        {t(item.label)}
      </span>
    </a>
  );
}

function DesktopRail() {
  const { items, railCollapsed, setRailCollapsed } = useShell();
  const { t } = useLocale();

  return (
    <nav
      aria-label={t({ ar: "التنقل الرئيسي", en: "Main navigation" })}
      className="fixed top-16 inset-y-0 start-0 z-30 hidden w-[68px] flex-col border-e border-gold/12 md:flex"
      style={{ width: railCollapsed ? 68 : 248, top: "4rem" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 pt-5 pb-4 border-b border-gold/10">
        <a
          href="/"
          aria-label="عقل في صندوق — الصفحة الرئيسية"
          className="gold-glow flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-black/60 text-gold-light transition-colors hover:border-gold/70"
        >
          <Logo size={24} />
        </a>
        <span className="display-arabic whitespace-nowrap text-base text-gold-light hidden" style={{ display: "none" }}>
          عقل في صندوق
        </span>
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
                <p className="px-3 pb-1.5 text-[10px] tracking-[0.22em] text-ink-3">
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

      {/* Footer: collapse */}
      <div className="border-t border-gold/10 p-3">
        <button
          type="button"
          onClick={() => setRailCollapsed(!railCollapsed)}
          aria-expanded={!railCollapsed}
          aria-label="طيّ الشريط الجانبي"
          className="flex items-center justify-center gap-2 rounded-full border border-gold/25 px-3 py-2 text-xs text-gold-muted transition-colors hover:border-gold/60 hover:text-gold-light"
        >
          <svg
            className={`size-4 transition-transform ${!railCollapsed ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {!railCollapsed && <span>طيّ</span>}
        </button>
      </div>
    </nav>
  );
}

/* ── mobile bottom bar (4 items) ――――――――――――――――――――――――― */

function BottomLink({ item }: { item: NavItem }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = iconFor(item.icon);

  return (
    <a
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors ${
        active ? "text-gold-light" : "text-gold-muted/70"
      }`}
    >
      <span className="relative">
        {(() => { const Icon = iconFor(item.icon); return <Icon className="size-5" />; })()}
        {active && (
          <span className="absolute -bottom-1 start-1/2 size-1 -translate-x-1/2 rounded-full bg-gold" />
        )}
      </span>
      <span className="text-[10px] leading-tight">{t(item.short)}</span>
    </a>
  );
}

function MobileShell() {
  const { primary } = useShell();
  const { t } = useLocale();

  // Five primary items fill the bottom bar. No "More" sheet needed.
  const items = primary.slice(0, 5);

  return (
    <div className="md:hidden">
      <nav
        aria-label={t({ ar: "التنقل السريع", en: "Quick navigation" })}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/12 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <BottomLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/*―――――――――――――――――――――――――――――― export ――――――――――――――――――――――――――――*/

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
 * Mobile: 5-item bottom bar. No hamburger, no "More" sheet.
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

/* iconFor helper (shared with Header) */