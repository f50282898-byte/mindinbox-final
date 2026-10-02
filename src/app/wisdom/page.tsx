import type { Metadata } from "next";
import { WisdomHub } from "@/components/WisdomHub";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "اسأل الحكيم",
  description: "واجهة الذكاء الاصطناعي — تتقمّص شخصيات الفلاسفة.",
};

export default function WisdomPage() {
  return <WisdomHub />;
}