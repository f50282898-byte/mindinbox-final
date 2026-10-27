"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, MessageSquare, NotebookPen, Activity, User, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/auth/AuthContext";
import { useLocale } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { desktopPrimary, mobilePrimary, FALLBACK_NAV } from "@/lib/nav";
const icons: Record<string, LucideIcon> = { BookOpen, MessageSquare, NotebookPen, Activity, User };
export function AppearanceControls() {
  const { theme, toggle } = useTheme();
  const { locale, toggle: toggleLocale } = useLocale();
  const ar = locale === "ar";
  return <div className="appearance-controls">
    <button type="button" onClick={toggleLocale} aria-label={ar ? "Switch to English" : "التبديل إلى العربية"} lang={ar ? "en" : "ar"}>{ar ? "EN" : "ع"}</button>
    <button type="button" onClick={toggle} aria-label={ar ? (theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن") : (theme === "dark" ? "Use light theme" : "Use dark theme")}>
      {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  </div>;
}
function Brand() {
  const { locale } = useLocale();
  return <Link href="/" className="shell-brand"><Logo size={30} ariaLabel={locale === "ar" ? "الرئيسية" : "Home"} /><span>{locale === "ar" ? "عقل في صندوق" : "Mind in a Box"}</span></Link>;
}
export function DesktopHeader() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const { user } = useAuth();
  return <header className="studio-header hidden md:block"><div className="studio-header-inner"><Brand />
    <nav aria-label={locale === "ar" ? "التنقل الرئيسي" : "Main navigation"} className="studio-nav">
      {desktopPrimary(FALLBACK_NAV).map((item) => <Link key={item.id} href={item.href} aria-current={pathname === item.href || pathname.startsWith(item.href + "/") ? "page" : undefined}>{item.label[locale]}</Link>)}
    </nav>
    <div className="flex items-center gap-2"><Link href={user ? "/account" : "/enter"} className="studio-account">{locale === "ar" ? (user ? "حسابي" : "الدخول") : (user ? "Account" : "Sign in")}</Link><AppearanceControls /></div>
  </div></header>;
}
export function MobileHeader() {
  return <header className="studio-header md:hidden"><div className="studio-header-inner"><Brand /><AppearanceControls /></div></header>;
}
export function MobileBottomBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { locale } = useLocale();
  const items = [...mobilePrimary(FALLBACK_NAV).slice(0, 4).map((item) => ({ ...item, text: item.short[locale] })), { id: "account", href: user ? "/account" : "/enter", icon: "User", text: locale === "ar" ? (user ? "حسابي" : "الدخول") : (user ? "Account" : "Sign in") }];
  return <nav className="studio-bottom-nav md:hidden" aria-label={locale === "ar" ? "التنقل السريع" : "Quick navigation"}><ul>{items.map((item) => {
    const Icon = icons[item.icon] ?? BookOpen;
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return <li key={item.id}><Link href={item.href} aria-current={active ? "page" : undefined}><Icon size={20} strokeWidth={1.7} aria-hidden="true" /><span>{item.text}</span></Link></li>;
  })}</ul></nav>;
}
