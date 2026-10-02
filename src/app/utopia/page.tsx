import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Legacy path. `/utopia` used to host the chat interface; the primary hub is
 * now `/wisdom` ("Ask the Wise"). Kept as a redirect so old links still land
 * in the right place.
 */
export default function UtopiaAlias() {
  redirect("/wisdom");
}