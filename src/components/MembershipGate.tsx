"use client";

import { useAppStore } from "@/lib/store";
import type { Tier } from "@/lib/tiers";
import { Membership } from "@/components/Membership";

/**
 * Client boundary for the membership page.
 *
 * `useAppStore` is a persisted zustand store (React hooks under the hood), so
 * it cannot be invoked from a Server Component. Keeping this in its own
 * `"use client"` file lets `page.tsx` stay a Server Component and still export
 * `metadata`.
 */
export function MembershipGate() {
  const tier = useAppStore((s) => s.tier);
  return <Membership currentTier={tier as Tier} />;
}