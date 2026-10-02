import type { Metadata } from "next";
import { MemberLibrary } from "@/components/MemberLibrary";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "المحراب — The Sanctum",
  description: "الدائرة الخاصة: مجتمع، ومحاضرات، وتحليل نفسي عميق.",
};

export default function SanctumPage() {
  return <MemberLibrary requiredTier="sanctum" />;
}