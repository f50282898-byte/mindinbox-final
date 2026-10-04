import type { Metadata } from "next";
import { MemberLibrary } from "@/components/MemberLibrary";
import { ArtLayer } from "@/components/art/ArtLayer";

export const metadata: Metadata = {
  title: "العرّاف — The Oracle",
  description: "مستوى العضوية: تتبّع غير محدود، تحليل يومي، ومخطوطات PDF.",
};

export default function OraclePage() {
  return (
    <div className="relative">
      <ArtLayer id="gate" />
      <MemberLibrary requiredTier="oracle" />
    </div>
  );
}