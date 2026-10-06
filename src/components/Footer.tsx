"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { NAV_GROUPS, groupItems, FALLBACK_NAV } from "@/lib/nav";

/**
 * Footer — minimal, clean, RTL.
 * Contains: logo, grouped nav links, legal links, copyright.
 */
export function Footer() {
  const { t } = useLocale();

  const practiceItems = groupItems(FALLBACK_NAV, "practice").filter(
    (i) => i.href !== "/enter"
  );
  const accountItems = groupItems(FALLBACK_NAV, "account");

  return (
    <footer
      className="border-t border-gold/10 bg-black/20"
      role="contentinfo"
      aria-label="تذييل الصفحة"
    >
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link
              href="/"
              aria-label="عقل في صندوق — الصفحة الرئيسية"
              className="flex items-center gap-2 mb-4"
            >
              <Logo size={28} ariaLabel="شعار عقل في صندوق" />
              <span className="display-arabic text-xl font-bold text-gold-light">
                عقل في صندوق
              </span>
            </Link>
            <p className="display-arabic text-sm leading-relaxed text-gold-muted/70 max-w-xs">
              ملاذك الفلسفي للذكاء الاصطناعي. اسأل، تأمّل، وابنِ وعيك — في بيئة معزولة عن ضجيج العالم.
            </p>
          </div>

          {/* Practice links */}
          <nav aria-label={t({ ar: "الممارسة", en: "Practice" })}>
            <h3 className="display-arabic text-xs font-bold tracking-[0.22em] text-gold-muted/70 mb-3">
              {t({ ar: "الممارسة", en: "Practice" })}
            </h3>
            <ul className="flex flex-col gap-2">
              {practiceItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="display-arabic text-sm text-gold-muted/70 hover:text-gold-light transition-colors"
                  >
                    {item.label.ar}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Account / Legal links */}
          <nav aria-label={t({ ar: "الحساب والقانوني", en: "Account & Legal" })}>
            <h3 className="display-arabic text-xs font-bold tracking-[0.22em] text-gold-muted/70 mb-3">
              {t({ ar: "الحساب", en: "Account" })}
            </h3>
            <ul className="flex flex-col gap-2">
              {accountItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="display-arabic text-sm text-gold-muted/70 hover:text-gold-light transition-colors"
                  >
                    {item.label.ar}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal + Social */}
          <nav aria-label={t({ ar: "قانوني", en: "Legal" })}>
            <h3 className="display-arabic text-xs font-bold tracking-[0.22em] text-gold-muted/70 mb-3">
              {t({ ar: "قانوني", en: "Legal" })}
            </h3>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  href="/privacy"
                  className="display-arabic text-sm text-gold-muted/70 hover:text-gold-light transition-colors"
                >
                  {t({ ar: "الخصوصية", en: "Privacy" })}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="display-arabic text-sm text-gold-muted/70 hover:text-gold-light transition-colors"
                >
                  {t({ ar: "الشروط", en: "Terms" })}
                </Link>
              </li>
              <li>
                <Link
                  href="/refund"
                  className="display-arabic text-sm text-gold-muted/70 hover:text-gold-light transition-colors"
                >
                  {t({ ar: "الاسترداد", en: "Refund" })}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-gold/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="display-arabic text-xs text-gold-muted/50">
            © {new Date().getFullYear()} عقل في صندوق. جميع الحقوق محفوظة.
          </p>
          <p className="display-latin text-xs text-gold-muted/50">
            Mind in a Box. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}