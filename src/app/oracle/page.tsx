import type { Metadata } from "next";
import { MemberLibrary } from "@/components/MemberLibrary";

export const metadata: Metadata = {
  title: "العرّاف — The Oracle",
  description: "مستوى العضوية: تتبّع غير محدود، تحليل يومي، ومخطوطات PDF.",
};

export default function OraclePage() {
  return <MemberLibrary requiredTier="oracle" />;
}