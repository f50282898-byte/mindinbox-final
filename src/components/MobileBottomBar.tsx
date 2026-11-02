"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  MessageSquare,
  NotebookPen,
  User,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n";

interface NavSlot {
  id: string;
  href: string;
  icon: LucideIcon;
  label: { ar: string; en: string };
  isAccount?: boolean;
}

/**
 * MobileBottomBar
 *
 * 5-slot navigation bar (Home, Wisdom, Dialogue, Journal, Account).
 * Satisfies E2E test contract T1.1.6:
 * - Selector: nav.studio-bottom-nav[aria-label="التنقل السريع"], nav.studio-bottom-nav[aria-label="Quick navigation"]
 * - 5 `li` elements
 * - Every item height >= 40px, width >= 44px
 * - Safe area inset bottom padding
 */
export function MobileBottomBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { locale, t } = useLocale();

  const slots: NavSlot[] = [
    {
      id: "home",
      href: "/",
      icon: Home,
      label: { ar: "الرئيسية", en: "Home" },
    },
    {
      id: "wisdom",
      href: "/wisdom",
      icon: BookOpen,
      label: { ar: "الحكمة", en: "Wisdom" },
    },
    {
      id: "dialogue",
      href: "/dialogue",
      icon: MessageSquare,
      label: { ar: "الحوار", en: "Dialogue" },
    },
    {
      id: "journal",
      href: "/journal",
      icon: NotebookPen,
      label: { ar: "المفكرة", en: "Journal" },
    },
    {
      id: "account",
      href: user ? "/account" : "/enter",
      icon: User,
      label: user
        ? { ar: "حسابي", en: "Account" }
        : { ar: "الدخول", en: "Sign in" },
      isAccount: true,
    },
  ];

  return (
    <nav
      className="studio-bottom-nav md:hidden"
      aria-label={t({ ar: "التنقل السريع", en: "Quick navigation" })}
    >
      <ul className="grid grid-cols-5 items-stretch justify-items-stretch w-full max-w-lg mx-auto">
        {slots.map((item) => {
          const active = item.isAccount
            ? pathname === "/account" || pathname === "/enter"
            : item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");

          const Icon = item.icon;

          return (
            <li key={item.id} className="min-w-[44px] min-h-[48px] flex items-stretch">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`min-h-[48px] min-w-[44px] w-full flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all ${
                  active
                    ? "text-gold font-medium bg-gold/10"
                    : "text-ink-3 hover:text-ink-1"
                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold`}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.2 : 1.7}
                  className="transition-transform duration-200"
                  aria-hidden="true"
                />
                <span className="text-[12px] leading-tight mt-1 truncate max-w-full text-center">
                  {item.label[locale]}
                </span>
                {active && (
                  <span
                    className="w-1 h-1 rounded-full bg-gold mt-0.5"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileBottomBar;
