"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { TIER_DEFINITIONS, TRIAL_DAYS, type Tier } from "@/lib/tiers";

/**
 * Membership ladder.
 *
 * Prices come from `siteConfig/pricing` (admin-controlled) with the shipped
 * defaults as fallback. Scarcity language is deliberate and bounded to what
 * the product can actually honour â€” no fake countdowns.
 */
const LADDER: Tier[] = ["free", "oracle", "sanctum"];

export function Membership({ currentTier }: { currentTier: Tier }) {
  const pricing = useAppStore((s) => s.pricing);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:py-20">
      <header className="mb-14 text-center">
        <p className="text-[10px] tracking-[0.35em] text-ink-3">MEMBERSHIP · العضوية</p>
        <h1 className="gold-text-glow display-arabic mt-4 text-3xl font-bold text-gold-light sm:text-5xl">
          اختر مستوى التزامك
        </h1>
        <p className="display-arabic mx-auto mt-5 max-w-xl text-sm leading-relaxed text-gold-muted/70">
          يبدأ الجميع من الباب نفسه. المستويات الأعلى تفتح أدوات أكبر، لا حكمة أكبر —
          الحكمة نفسُها متاحة للجميع.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {LADDER.map((id, index) => {
          const tier = TIER_DEFINITIONS[id];
          const price = pricing[id] ?? tier.priceUsd;
          const isCurrent = currentTier === id;
          const featured = id === "oracle";

          return (
            <motion.article
              key={id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
              className={`panel relative flex flex-col p-7 ${
                featured ? "gold-frame gold-glow md:-mt-4 md:mb-[-1rem]" : ""
              } ${isCurrent ? "border-gold/60" : ""}`}
            >
              {featured && (
                <span className="absolute -top-3 start-7 rounded-full bg-gold px-3 py-1 text-[10px] font-bold tracking-widest text-black">
                  الأكثر اختياراً
                </span>
              )}

              <header>
                <h2 className="display-arabic text-2xl font-bold text-gold-light">{tier.name}</h2>
                <p className="display-latin mt-0.5 text-[10px] tracking-[0.25em] text-ink-3">
                  {tier.latin}
                </p>
              </header>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="display-latin text-4xl font-bold text-gold-light">${price}</span>
                {tier.period && (
                  <span className="text-xs text-gold-muted/60">{tier.period}</span>
                )}
              </div>

              <p className="display-arabic mt-4 text-sm leading-relaxed text-gold-muted/75">
                {tier.tagline}
              </p>

              <div className="hairline my-6" />

              <ul className="flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-gold-muted/85">
                    <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                {isCurrent ? (
                  <span className="btn-ghost w-full cursor-default opacity-70">مستواك الحالي</span>
                ) : (
                  <a
                    href={
                      id === "free"
                        ? "/wisdom"
                        : "mailto:membership@mindinbox.app?subject=" +
                          encodeURIComponent(`العضوية: ${tier.name}`)
                    }
                    className={featured ? "btn-gold w-full" : "btn-ghost w-full"}
                  >
                    <span>{tier.cta}</span>
                  </a>
                )}
                <p className="mt-3 text-center text-[10px] leading-relaxed text-ink-3">
                  {tier.scarcity}
                </p>
              </div>
            </motion.article>
          );
        })}
      </div>

      <p className="display-arabic mx-auto mt-12 max-w-xl text-center text-xs leading-relaxed text-ink-3">
        التسجيل يمنحك {TRIAL_DAYS} يوماً من التجربة الكاملة بلا بطاقة. لا يوجد تغيير تلقائي،
        ولا نخزّن أي بيانات مالية على الإطلاق.
      </p>
    </div>
  );
}