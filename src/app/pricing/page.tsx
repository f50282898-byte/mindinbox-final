import type { Metadata } from "next";
import { PricingGrid } from "@/components/PricingGrid";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "العضويات",
  description:
    "ثلاثة مستويات: الزائر، العرّاف، المحراب. ما يشمله كل مستوى مكتوب بوضوح، بلا خصومات ولا عدّادات.",
  alternates: { canonical: "/pricing", languages: { ar: "/pricing", en: "/pricing" } },
  openGraph: {
    title: "العضويات | عقل في صندوق",
    description: "ما يشمله كل مستوى مكتوب بوضوح، بلا خصومات ولا عدّادات.",
    url: absoluteUrl("/pricing"),
  },
};

export default function PricingPage() {
  return <PricingGrid />;
}
