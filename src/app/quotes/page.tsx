import type { Metadata } from "next";
import { QuotesApp } from "@/components/quotes/QuotesApp";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "اقتباسات",
  description:
    "اقتباسات فلسفية موثّقة، لكل منها مصدر محدّد: الكتاب والموضع والمترجم والطبعة.",
  alternates: { canonical: "/quotes", languages: { ar: "/quotes", en: "/quotes" } },
  openGraph: {
    title: "اقتباسات | عقل في صندوق",
    description: "كل اقتباس هنا له مصدر يمكن التحقق منه.",
    url: absoluteUrl("/quotes"),
  },
};

/**
 * The quotes page.
 *
 * Everything it renders comes from `VERIFIED_QUOTES`, so the guarantee that
 * nothing unverified is shown is enforced in the accessor rather than in a filter
 * here. A page-level filter would be one refactor away from being dropped; an
 * accessor that returns `null` is not.
 */
export default function QuotesPage() {
  return <QuotesApp />;
}
