export const runtime = 'edge';

import type { Metadata } from "next";
import { Suspense } from "react";
import { UtopiaHero } from "@/components/UtopiaHero";
import { GoldDust } from "@/components/GoldDust";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "عقل في صندوق",
  description:
    "ملاذك الفلسفي للذكاء الاصطناعي، في بيئة معزولة عن ضجيج العالم. لا تسأل لتجد الإجابة، بل تساءل لترتقي بوعيك.",
  alternates: { canonical: "/", languages: { ar: "/", en: "/" } },
  openGraph: {
    title: "عقل في صندوق | Mind in a Box",
    description: "ملاذك الفلسفي للذكاء الاصطناعي، في بيئة معزولة عن ضجيج العالم.",
    url: SITE_URL,
  },
};

/**
 * JSON-LD for the home page.
 *
 * Deliberately narrow: `WebApplication` and `Organization` describe what this
 * page actually is.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "عقل في صندوق",
      alternateName: "Mind in a Box",
      inLanguage: ["ar", "en"],
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "عقل في صندوق",
      alternateName: "Mind in a Box",
      url: SITE_URL,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript.",
      inLanguage: ["ar", "en"],
      description:
        "ملاذ فلسفي للذكاء الاصطناعي: حوار مع فلاسفة، ومفكرة خاصة، وتتبّع للوعي اليومي.",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "عقل في صندوق",
      url: SITE_URL,
      logo: `${SITE_URL}/images/Logo_representing_philosophical___2K_20260922065211.webp`,
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {/* 
        Single Main Landmark Integrity:
        ShellChrome owns <main id="main"> for chromeless routes.
        HomePage renders <div className="relative"> to ensure exactly 1 <main> exists in DOM.
      */}
      <div className="relative min-h-screen overflow-hidden">
        {/* Ambient Gold Dust Radiance Layer */}
        <GoldDust count={36} className="opacity-75 z-0" />

        <div className="relative z-10 sanctuary-container">
          <Suspense fallback={null}>
            <UtopiaHero />
          </Suspense>
        </div>
      </div>
    </>
  );
}
