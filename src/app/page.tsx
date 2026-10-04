import type { Metadata } from "next";
import { UtopiaHero } from "@/components/UtopiaHero";
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
 * page actually is. No `Review`, no `AggregateRating`, no `offers` with a price
 * — there is no payment path, no user rating, and nothing here has been
 * measured. Structured data that overstates the product is a liability.
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
        // Free tier exists and is real; the paid tiers are stated on /pricing
        // but there is no checkout, so no paid offer is declared here.
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
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, developer-authored object. No user input reaches this string.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <main className="relative">
        <UtopiaHero />
      </main>
    </>
  );
}
