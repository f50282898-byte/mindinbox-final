import type { Metadata } from "next";
import { DailyTracker } from "@/components/DailyTracker";
import { ArtLayer } from "@/components/art/ArtLayer";
import { absoluteUrl, getCanonicalUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "متتبع الوعي",
  description:
    "سجّل عاداتك وأفكارك اليومية، وراقب خطّها عبر الأسابيع. سجلّك في حسابك، ويبقى متاحاً دون اتصال.",
  alternates: { canonical: "/tracker", languages: { ar: "/tracker", en: "/tracker" } },
  openGraph: {
    title: "متتبع الوعي | عقل في صندوق",
    description: "سجّل عاداتك وأفكارك اليومية، وراقب خطّها عبر الأسابيع.",
    url: absoluteUrl("/tracker"),
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "متتبع الوعي" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "متتبع الوعي | عقل في صندوق",
    description: "سجّل عاداتك وأفكارك اليومية، وراقب خطّها عبر الأسابيع.",
    images: ["/og.png"],
  },
  /**
   * `noindex` — see the note in `/enter`.
   *
   * The tracker needs Firebase for anything beyond the local mirror, so an unconfigured
   * build shows an unavailable screen. The tracker is a private surface reached from the
   * nav; it is not a search result anyone wants to land on.
   */
  robots: { index: false, follow: false },
  other: {
    canonical: getCanonicalUrl("/tracker"),
  },
};

export default function TrackerPage() {
  return (
    <div className="relative">
      <ArtLayer id="hourglass" />
      <DailyTracker />
    </div>
  );
}