import type { Metadata } from "next";
import { UtopiaHero } from "@/components/UtopiaHero";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "عقل في صندوق",
  description: "ابدأ الآن — ملاذك الفلسفي.",
};

export default function HomePage() {
  return (
    <main className="relative">
      <UtopiaHero />
    </main>
  );
}