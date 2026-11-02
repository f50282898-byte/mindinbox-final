"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { groupItems, FALLBACK_NAV } from "@/lib/nav";

/**
 * Footer — minimal, clean, RTL.
 * Contains: logo, grouped nav links, legal links, copyright.
 */
export function Footer() {
  const { t, locale } = useLocale();

  const practiceItems = groupItems(FALLBACK_NAV, "practice").filter(
    (i) => i.href !== "/enter"
  );
  const accountItems = groupItems(FALLBACK_NAV, "account");

  return (
    <footer
      className="border-t border-hairline bg-surface-1 backdrop-blur-md"
      role="contentinfo"
      aria-label={t({ ar: "تذييل الصفحة", en: "Footer" })}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-10 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link
              href="/"
              aria-label={t({
                ar: "عقل في صندوق — الصفحة الرئيسية",
                en: "Mind in a Box — Home",
              })}
              className="min-h-[44px] inline-flex items-center gap-2 mb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold rounded-lg"
            >
              <Logo
                size={28}
                ariaLabel={t({
                  ar: "شعار عقل في صندوق",
                  en: "Mind in a Box logo",
                })}
              />
              <span
                className={
                  locale === "ar"
                    ? "display-arabic text-xl font-bold text-gold-light"
                    : "display-latin text-xl font-bold text-gold-light"
                }
              >
                {locale === "ar" ? "عقل في صندوق" : "Mind in a Box"}
              </span>
            </Link>
            <p
              className={`text-sm leading-relaxed text-gold-muted max-w-xs ${
                locale === "ar" ? "display-arabic" : "display-latin"
              }`}
            >
              {t({
                ar: "ملاذك الفلسفي للذكاء الاصطناعي. اسأل، تأمّل، وابنِ وعيك — في بيئة معزولة عن ضجيج العالم.",
                en: "Your philosophical sanctuary for artificial intelligence. Inquire, reflect, and cultivate consciousness — insulated from the world's noise.",
              })}
            </p>
          </div>

          {/* Practice links */}
          <nav aria-label={t({ ar: "الممارسة", en: "Practice" })}>
            <h3 className="display-arabic text-xs font-bold tracking-[0.22em] text-gold-muted mb-3">
              {t({ ar: "الممارسة", en: "Practice" })}
            </h3>
            <ul className="flex flex-col gap-1">
              {practiceItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`min-h-[44px] flex items-center text-sm text-gold-muted hover:text-gold-light transition-colors ${
                      locale === "ar" ? "display-arabic" : "display-latin"
                    }`}
                  >
                    {item.label[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Account / Legal links */}
          <nav aria-label={t({ ar: "الحساب والقانوني", en: "Account & Legal" })}>
            <h3 className="display-arabic text-xs font-bold tracking-[0.22em] text-gold-muted mb-3">
              {t({ ar: "الحساب", en: "Account" })}
            </h3>
            <ul className="flex flex-col gap-1">
              {accountItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`min-h-[44px] flex items-center text-sm text-gold-muted hover:text-gold-light transition-colors ${
                      locale === "ar" ? "display-arabic" : "display-latin"
                    }`}
                  >
                    {item.label[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal + Social */}
          <nav aria-label={t({ ar: "قانوني", en: "Legal" })}>
            <h3 className="display-arabic text-xs font-bold tracking-[0.22em] text-gold-muted mb-3">
              {t({ ar: "قانوني", en: "Legal" })}
            </h3>
            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href="/privacy"
                  className={`min-h-[44px] flex items-center text-sm text-gold-muted hover:text-gold-light transition-colors ${
                    locale === "ar" ? "display-arabic" : "display-latin"
                  }`}
                >
                  {t({ ar: "الخصوصية", en: "Privacy" })}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className={`min-h-[44px] flex items-center text-sm text-gold-muted hover:text-gold-light transition-colors ${
                    locale === "ar" ? "display-arabic" : "display-latin"
                  }`}
                >
                  {t({ ar: "الشروط", en: "Terms" })}
                </Link>
              </li>
              {/*
                No refund link.

                There is no payment path in this product, so there is nothing to
                refund and no policy to state. `public/_redirects` already carries
                `/refund /terms 301` for anyone who follows an old link; listing it
                here as well would only offer a second route to the same dead end.
              */}
            </ul>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-gold/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="display-arabic text-xs text-gold-muted">
            © {new Date().getFullYear()} عقل في صندوق. جميع الحقوق محفوظة.
          </p>
          <p className="display-latin text-xs text-gold-muted">
            Mind in a Box. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}