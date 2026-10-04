import type { Metadata } from "next";
import { MemberLibrary } from "@/components/MemberLibrary";
import { ArtLayer } from "@/components/art/ArtLayer";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "المحراب — The Sanctum",
  description: "الدائرة الخاصة: مجتمع، ومحاضرات، وتحليل نفسي عميق.",
  alternates: { canonical: "/sanctum", languages: { ar: "/sanctum", en: "/sanctum" } },
  openGraph: {
    title: "المحراب — The Sanctum | عقل في صندوق",
    description: "الدائرة الخاصة: مجتمع، ومحاضرات، وتحليل نفسي عميق.",
    url: absoluteUrl("/sanctum"),
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "المحراب" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "المحراب — The Sanctum | عقل في صندوق",
    description: "الدائرة الخاصة: مجتمع، ومحاضرات، وتحليل نفسي عميق.",
    images: ["/og.png"],
  },
};

export default function SanctumPage() {
  return (
    <div className="relative">
      <ArtLayer id="gate" />
      <MemberLibrary requiredTier="sanctum" />
    </div>
  );
}