import { redirect } from "next/navigation";

/**
 * `/membership` was the old tier ladder. `/pricing` replaced it with honest,
 * bilingual column copy; this redirect keeps existing links and bookmarks
 * working rather than 404ing them.
 */
export default function MembershipRedirect() {
  redirect("/pricing");
}
