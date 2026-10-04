import type { Metadata } from "next";
import Link from "next/link";
import { ArtLayer } from "@/components/art/ArtLayer";
import { absoluteUrl } from "@/lib/seo";
import { FALLBACK_SITE_CONFIG } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "المسارات",
  description: "المسارات الثلاثة: الزائر، العرّاف، المحراب — وما يفتحه كل مسار.",
  alternates: { canonical: "/paths", languages: { ar: "/paths", en: "/paths" } },
  openGraph: {
    title: "المسارات | عقل في صندوق",
    description: "المسارات الثلاثة، وما يفتحه كل مسار.",
    url: absoluteUrl("/paths"),
  },
};

/** Deep pages that live under a path but are not in the top-level nav. */
const DEEP_LINKS = [
  {
    tiers: ["oracle", "sanctum"] as const,
    href: "/oracle",
    ar: "العرّاف",
    en: "The Oracle",
    bodyAr: "المكتبة الدراسية: ملفات PDF تُقرأ على مهل.",
    bodyEn: "The study library: PDF material to read slowly.",
  },
  {
    tiers: ["sanctum"] as const,
    href: "/sanctum",
    ar: "المحراب",
    en: "The Sanctum",
    bodyAr: "المكتبة الخاصة، والمحاضرات، والتحليل العميق.",
    bodyEn: "The private library, lectures, and deep analysis.",
  },
];

export default function PathsPage() {
  return (
    <div className="relative min-h-[80vh]">
      <ArtLayer id="astrolabe" />
      <div className="relative mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="mb-10">
        <h1 className="display-arabic text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          المسارات
        </h1>
        <p className="display-latin mt-1 text-lg text-gold-muted/70">Paths</p>
        <p className="display-arabic mt-4 max-w-2xl leading-loose text-gold-muted">
          ثلاثة مسارات، كل واحد يفتح باباً ويغلق غيره. لا يوجد مسار أعلى من غيره — يوجد فقط
          ما يناسبك الآن.
        </p>
      </header>

      <ol className="flex flex-col gap-4">
        {FALLBACK_SITE_CONFIG.pricing.map((tier, i) => {
          const deep = DEEP_LINKS.filter((d) => (d.tiers as readonly string[]).includes(tier.id));
          return (
            <li key={tier.id}>
              <article className={`glass p-6 ${tier.highlighted ? "gold-frame" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="display-latin text-xs tracking-[0.3em] text-gold/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="display-arabic text-xl font-bold text-gold-light">
                    {tier.name.ar}
                  </h2>
                  <span className="display-latin text-sm text-gold-muted/55">{tier.latin}</span>
                </div>

                <p className="display-arabic mt-3 leading-loose text-gold-muted/85">
                  {tier.tagline.ar}
                </p>

                <ul className="mt-4 flex flex-col gap-1.5">
                  {tier.includes.map((f, j) => (
                    <li
                      key={j}
                      className="display-arabic text-sm leading-relaxed text-gold-muted/75"
                    >
                      · {f.ar}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={tier.href} className="btn-ghost inline-flex px-5 py-2 text-sm">
                    {tier.cta.ar}
                  </Link>
                  {deep.map((d) => (
                    <Link
                      key={d.href}
                      href={d.href}
                      className="text-sm text-gold-muted/70 underline-offset-4 hover:text-gold-light hover:underline"
                    >
                      {d.ar}
                      <span className="display-latin mx-2 text-xs text-gold-muted/40">
                        {d.en}
                      </span>
                    </Link>
                  ))}
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <p className="mt-10 text-sm leading-relaxed text-gold-muted/60">
        <Link href="/pricing" className="text-gold-muted underline-offset-4 hover:underline">
          مقارنة تفصيلية بين المستويات
        </Link>
      </p>
      </div>
    </div>
  );
}
