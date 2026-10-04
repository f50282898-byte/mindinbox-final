import type { Metadata } from "next";
import { MemberLibrary } from "@/components/MemberLibrary";
import { ArtLayer } from "@/components/art/ArtLayer";

export const metadata: Metadata = {
  title: "المحراب — The Sanctum",
  description: "الدائرة الخاصة: مجتمع، ومحاضرات، وتحليل نفسي عميق.",
};

export default function SanctumPage() {
  return (
    <div className="relative">
      <ArtLayer id="gate" />
      <MemberLibrary requiredTier="sanctum" />
    </div>
  );
}