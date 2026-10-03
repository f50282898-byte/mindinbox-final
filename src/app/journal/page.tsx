import type { Metadata } from "next";
import { Journal } from "@/components/Journal";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "المفكرة",
  description:
    "اكتب ما يشغلك. ما تكتبه في المفكرة لا يُرسل إلى أي نموذج ذكاء اصطناعي إلا بطلب منك.",
  alternates: { canonical: "/journal", languages: { ar: "/journal", en: "/journal" } },
  openGraph: {
    title: "المفكرة | عقل في صندوق",
    description: "اكتب ما يشغلك. ما تكتبه لا يُرسل إلى نموذج ذكاء اصطناعي إلا بطلب منك.",
    url: absoluteUrl("/journal"),
  },
};

export default function JournalPage() {
  return <Journal />;
}
