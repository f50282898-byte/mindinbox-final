import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Legacy alias.
 *
 * This previously rendered a second, independent copy of the console. Two URLs
 * for one privileged surface doubles the attack surface and makes the "hidden"
 * requirement meaningless, so it now simply forwards to `/admin`.
 */
export default function LegacyAdminAlias() {
  redirect("/admin");
}