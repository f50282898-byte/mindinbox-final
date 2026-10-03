import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "الأقوال",
  description: "أرشيف أقوال الفلاسفة — يُجمع المراجعة مع ذكر المصدر لكل قول.",
  alternates: { canonical: "/quotes", languages: { ar: "/quotes", en: "/quotes" } },
  openGraph: {
    title: "الأقوال | عقل في صندوق",
    description: "أرشيف أقوال الفلاسفة، يُجمع المراجعة مع ذكر المصدر لكل قول.",
    url: absoluteUrl("/quotes"),
  },
};

/**
 * Quotations archive — deliberately empty.
 *
 * A quotations page is only worth having if every line can be traced to a
 * source, and the popular web is full of Nietzsche and Marcus Aurelius lines
 * that are misattributed, truncated, or invented. Shipping any of that would
 * be publishing something unverifiable under this app's name.
 *
 * So the page states plainly what is being assembled and what the standard for
 * inclusion is. Tracked in PROJECT_MAP under ORPHANS & PENDING.
 */
export default function QuotesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="display-arabic text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          الأقوال
        </h1>
        <p className="display-latin mt-1 text-lg text-gold-muted/70">Quotations</p>
      </header>

      <div className="glass p-7">
        <BookOpen className="size-5 text-gold/70" aria-hidden="true" />

        <h2 className="display-arabic mt-4 text-lg font-bold text-gold-light">
          الأرشيف قيد الإعداد
        </h2>
        <p className="display-arabic mt-3 leading-loose text-gold-muted">
          لن ننشر هنا سطراً لا نستطيع أن نشير إلى مصدره.
        </p>
        <p className="mt-3 leading-relaxed text-gold-muted/65">
          We will not publish a single line here that we cannot trace to a source.
        </p>

        <h3 className="display-arabic mt-7 text-sm font-semibold text-gold-light">
          معيار الإدخال
        </h3>
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {[
            { ar: "لكل قول مصدره معروف: الكتاب والفصل.", en: "Every quotation carries its work and section." },
            { ar: "النص مذكور بلغته الأصلية، مع ترجمة.", en: "The original wording is given, with translation." },
            { ar: "ما تنسبه المصادر الشعبية إلى فلاسف ويُردّ إلى غيره يُستبعد.", en: "Lines popularly attributed but traced elsewhere are excluded." },
            { ar: "ما لا نعرف مصدره لا يدخل الأرشيف.", en: "What we cannot source does not enter the archive." },
          ].map((r) => (
            <li
              key={r.ar}
              className="display-arabic text-sm leading-relaxed text-gold-muted/80"
            >
              · {r.ar}
            </li>
          ))}
        </ul>

        <p className="display-arabic mt-6 text-sm leading-relaxed text-gold-muted/70">
          للآن، اقرأ{" "}
          <Link href="/wisdom" className="text-gold-light underline-offset-4 hover:underline">
            الفلاسفة
          </Link>{" "}
          وتحدّث إليهم في{" "}
          <Link href="/dialogue" className="text-gold-light underline-offset-4 hover:underline">
            الحوار
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
