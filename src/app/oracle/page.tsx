import { MemberPortal } from "@/components/MemberPortal";

export const runtime = "edge";

export default function OraclePage() {
  return <MemberPortal requiredTier="oracle" />;
}
