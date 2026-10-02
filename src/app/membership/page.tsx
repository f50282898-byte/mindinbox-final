import type { Metadata } from "next";
import { Suspense } from "react";
import { MembershipGate } from "@/components/MembershipGate";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "العضوية",
  description: "المستويات: الزائر، العرّاف، المحراب.",
};

/**
 * The tier ladder itself lives behind a client boundary (it reads the persisted
 * zustand store). Suspense keeps that store access out of the static shell.
 */
export default function MembershipPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-volcanic" />}>
      <MembershipGate />
    </Suspense>
  );
}