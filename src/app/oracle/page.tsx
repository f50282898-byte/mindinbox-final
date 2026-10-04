import type { Metadata } from "next";
import { MemberLibrary } from "@/components/MemberLibrary";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "العرّاف — The Oracle",
  description: "مستوى العضوية: تتبّع غير محدود، تحليل يومي، ومخطوطات PDF.",
  alternates: { canonical: "/oracle", languages: { ar: "/oracle", en: "/oracle" } },
  openGraph: {
    title: "العرّاف — The Oracle | عقل في صندوق",
    description: "مستوى العضوية: تتبّع غير محدود، تحليل يومي، ومخطوطات PDF.",
    url: absoluteUrl("/oracle"),
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "العرّاف" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "العرّاف — The Oracle | عقل في صندوق",
    description: "مستوى العضوية: تتبّع غير محدود، تحليل يومي، ومخطوطات PDF.",
    images: ["/og.png"],
  },
};

export default function OraclePage() {
  return <MemberLibrary requiredTier="oracle" />;
}