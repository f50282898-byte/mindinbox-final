import { MemberPortal } from "@/components/MemberPortal";

export const runtime = "edge";

export default function SanctumPage() {
  return <MemberPortal requiredTier="sanctum" />;
}
