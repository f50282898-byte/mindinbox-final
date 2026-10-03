import type { Metadata } from "next";
import { AuthPanel } from "@/components/AuthPanel";
import { absoluteUrl } from "@/lib/seo";
import { TIER_DEFINITIONS } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "المدخل",
  description:
    "سجّل الدخول، أو أنشئ حساباً، أو جرّب كضيف. سجل الضيف يُحفظ عند إنشاء الحساب.",
  alternates: { canonical: "/enter", languages: { ar: "/enter", en: "/enter" } },
  openGraph: {
    title: "المدخل | عقل في صندوق",
    description: "سجّل الدخول، أو أنشئ حساباً، أو جرّب كضيف.",
    url: absoluteUrl("/enter"),
  },
};

export default function EnterPage() {
  const free = TIER_DEFINITIONS.free;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 px-5 py-12 sm:py-16 lg:flex-row lg:items-start lg:gap-16">
      <div className="flex w-full flex-col items-center lg:order-2 lg:pt-6">
        <AuthPanel />
      </div>

      {/* Why an account, stated without pressure. */}
      <div className="w-full lg:order-1">
        <p className="display-latin text-xs tracking-[0.3em] text-gold-muted/40">MIND IN A BOX</p>
        <h1 className="display-arabic mt-3 text-3xl font-bold leading-tight text-gold-light sm:text-4xl">
          من أين تبدأ؟
        </h1>
        <p className="display-arabic mt-4 max-w-md leading-loose text-gold-muted">
          لا يوجد مسار واحد صحيح. تحدّث إلى فيلسوف، أو دوّن فكرة، أو تتبّع وعيك اليومي.
        </p>

        <section className="mt-8" aria-labelledby="free-tier">
          <h2 id="free-tier" className="display-arabic text-sm font-semibold text-gold-light">
            المستوى المجاني
          </h2>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {free.features.map((f) => (
              <li key={f} className="display-arabic text-sm leading-relaxed text-gold-muted/85">
                · {f}
              </li>
            ))}
          </ul>
          <p className="display-arabic mt-4 text-sm leading-loose text-gold-muted/65">
            هذا المستوى حقيقي وبلا تاريخ انتهاء. إن أحسست أن الحد لم يكفِ، ذكّرنا.
          </p>
        </section>

        <section className="mt-8" aria-labelledby="privacy-note">
          <h2 id="privacy-note" className="display-arabic text-sm font-semibold text-gold-light">
            ما نكتبه عنك
          </h2>
          <p className="display-arabic mt-2.5 text-sm leading-loose text-gold-muted/75">
            إن اخترت إنشاء حساب، يبقى ما كتبته في جهازك وحده. وما تكتبه في المفكرة لا يُرسل
            إلى أي نموذج ذكاء اصطناعي إلا بطلب منك.
          </p>
        </section>
      </div>
    </div>
  );
}
