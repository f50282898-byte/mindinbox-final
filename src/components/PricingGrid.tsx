"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import { FALLBACK_SITE_CONFIG, type PricingTier } from "@/lib/site-config";
import { usePricingConfig } from "@/lib/site-config-client";

/**
 * Pricing — three honest columns.
 *
 * Reads `siteConfig/pricing` through `usePricingConfig`, which ships the static
 * default immediately and upgrades to the Firestore document only when it
 * validates. There is deliberately no countdown, no "N people remaining", and
 * no struck-through discount: we cannot substantiate any of them, and the
 * founder brief rules them out.
 */
export function PricingGrid() {
  const { tiers, source } = usePricingConfig();
  const { t } = useLocale();

  const shown = useMemo(() => tiers ?? FALLBACK_SITE_CONFIG.pricing, [tiers]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <header className="mb-10 max-w-2xl">
        <h1 className="display-arabic text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          العضويات
        </h1>
        <p className="display-latin mt-1 text-lg text-gold-muted/70">Membership</p>
        <p className="display-arabic mt-5 leading-loose text-gold-muted">
          ثلاثة مستويات، وما يشمله كل واحد منها مكتوب بوضوح. لا خصومات موسمية ولا عدّادات
          تنازلية: الأرقام التي تراها هنا هي الأرقام التي ستدفعها.
        </p>
        <p className="mt-3 leading-relaxed text-gold-muted/70">
          Three tiers, each with exactly what it includes written out. No seasonal discounts and
          no countdown timers — the numbers here are the numbers you pay.
        </p>
        {/* Surfaced so it is never a hidden fact which copy is live. */}
        <p className="mt-5 text-xs text-gold-muted/40" data-pricing-source={source}>
          {source === "remote"
            ? t({ ar: "الأسعار محمّلة من إعدادات الموقع.", en: "Pricing loaded from site settings." })
            : t({ ar: "الأسعار الافتراضية المعروضة.", en: "Showing default pricing." })}
        </p>
      </header>

      <ul className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
        {shown.map((tier) => (
          <li key={tier.id} className="h-full">
            <TierCard tier={tier} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TierCard({ tier }: { tier: PricingTier }) {
  const { t } = useLocale();

  return (
    <article
      className={`glass flex h-full flex-col p-6 ${
        tier.highlighted ? "gold-frame" : ""
      }`}
      aria-labelledby={`tier-${tier.id}`}
    >
      <h2 id={`tier-${tier.id}`} className="display-arabic text-2xl font-bold text-gold-light">
        {t(tier.name)}
      </h2>
      <p className="display-latin text-sm tracking-wide text-gold-muted/55">{tier.latin}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="display-arabic text-3xl font-bold text-gold-light">{t(tier.price)}</span>
        <span className="text-sm text-gold-muted/60">{t(tier.period)}</span>
      </p>

      <p className="display-arabic mt-4 leading-relaxed text-gold-muted/85">{t(tier.tagline)}</p>

      {tier.highlighted && (
        <p className="display-arabic mt-4 inline-flex w-fit rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-light">
          الأكثر اختياراً
        </p>
      )}

      <Link
        href={tier.href}
        className={`mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity ${
          tier.highlighted ? "btn-gold" : "btn-ghost"
        }`}
      >
        {t(tier.cta)}
      </Link>

      {/* Included: real entitlements, phrased positively. */}
      <section className="mt-7">
        <h3 className="display-arabic mb-3 text-sm font-semibold text-gold-light">يشمل</h3>
        <ul className="flex flex-col gap-2">
          {tier.includes.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-1 size-3.5 shrink-0 text-gold/70" aria-hidden="true" />
              <span className="display-arabic text-sm leading-relaxed text-gold-muted/85">
                {t(item)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Excluded: stated plainly. A tier list that only says what is included
          reads as though everything else is included. */}
      <section className="mt-6 border-t border-gold/12 pt-5">
        <h3 className="display-arabic mb-3 text-sm font-semibold text-gold-muted/70">لا يشمل</h3>
        <ul className="flex flex-col gap-2">
          {tier.limits.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <Minus className="mt-1 size-3.5 shrink-0 text-gold-muted/40" aria-hidden="true" />
              <span className="text-sm leading-relaxed text-gold-muted/60">{t(item)}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export default PricingGrid;
